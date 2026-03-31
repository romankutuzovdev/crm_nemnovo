from datetime import datetime, timezone
from uuid import UUID, uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.audit import write_audit_log
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.clients.repository import CompanyRepository
from app.modules.deals.repository import DealRepository
from app.modules.payments.models import Invoice, Payment
from app.modules.payments.repository import InvoiceRepository, PaymentRepository
from app.modules.payments.schemas import InvoiceCreate, OnlinePaymentInitRequest, OnlinePaymentInitResponse, PaymentCreate
from app.shared.enums import AuditAction, PaymentMethod, PaymentTxStatus

logger = structlog.get_logger()


class PaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PaymentRepository(session)
        self.invoice_repo = InvoiceRepository(session)
        self.deal_repo = DealRepository(session)
        self.company_repo = CompanyRepository(session)

    async def _recalc_deal_payment_aggregates(self, deal_id: UUID) -> tuple[float, str]:
        """
        Источник истины по paid_amount — сумма CONFIRMED платежей.
        Так мы избегаем накопления ошибок/рассинхронизации при возвратах и вебхуках.
        """
        deal = await self.deal_repo.get_for_update(deal_id)
        paid = await self.repo.sum_confirmed_by_deal(deal_id)
        deal.paid_amount = paid
        deal.recalculate_payment_status()
        return float(deal.paid_amount), str(deal.payment_status)

    async def create_payment(self, data: PaymentCreate, confirmed_by: UUID) -> Payment:
        if data.amount <= 0:
            raise ValidationError("Payment amount must be positive")

        # Pessimistic lock to prevent race conditions (must run in request transaction)
        payment = Payment(
            deal_id=data.deal_id,
            amount=data.amount,
            method=data.method,
            status=PaymentTxStatus.CONFIRMED,
            confirmed_by=confirmed_by,
            paid_at=datetime.now(timezone.utc),
            notes=data.notes,
        )
        self.session.add(payment)
        await self.session.flush()

        new_paid, new_status = await self._recalc_deal_payment_aggregates(data.deal_id)

        await write_audit_log(
            self.session,
            confirmed_by,
            AuditAction.CREATE,
            "payments",
            payment.id,
            after={
                "deal_id": str(data.deal_id),
                "amount": data.amount,
                "method": data.method,
                "new_deal_paid": new_paid,
                "new_deal_status": new_status,
            },
        )

        logger.info(
            "payment.created",
            payment_id=str(payment.id),
            deal_id=str(data.deal_id),
            amount=data.amount,
            new_status=new_status,
        )
        return payment

    async def confirm_online_payment(self, external_id: str) -> Payment:
        """Called from payment provider webhook."""
        payment = await self.repo.get_by_external_id(external_id)
        if not payment:
            raise NotFoundError(f"Payment with external_id {external_id} not found")

        if payment.status == PaymentTxStatus.CONFIRMED:
            return payment  # Idempotent

        payment.status = PaymentTxStatus.CONFIRMED
        payment.paid_at = datetime.now(timezone.utc)

        new_paid, new_status = await self._recalc_deal_payment_aggregates(payment.deal_id)
        await write_audit_log(
            self.session,
            None,
            AuditAction.UPDATE,
            "payments",
            payment.id,
            after={
                "external_id": external_id,
                "status": PaymentTxStatus.CONFIRMED.value,
                "new_deal_paid": new_paid,
                "new_deal_status": new_status,
            },
        )

        logger.info("payment.confirmed_online", external_id=external_id)
        return payment

    async def refund_payment(self, payment_id: UUID, refunded_by: UUID) -> Payment:
        payment = await self.repo.get_or_raise(payment_id)
        if payment.status != PaymentTxStatus.CONFIRMED:
            raise ValidationError("Only confirmed payments can be refunded")

        payment.status = PaymentTxStatus.REFUNDED
        new_paid, new_status = await self._recalc_deal_payment_aggregates(payment.deal_id)

        await write_audit_log(
            self.session,
            refunded_by,
            AuditAction.UPDATE,
            "payments",
            payment_id,
            after={
                "status": PaymentTxStatus.REFUNDED.value,
                "new_deal_paid": new_paid,
                "new_deal_status": new_status,
            },
        )

        logger.info("payment.refunded", payment_id=str(payment_id))
        return payment

    async def list_by_deal(self, deal_id: UUID) -> list[Payment]:
        await self.deal_repo.get_or_raise(deal_id)
        return await self.repo.list_by_deal(deal_id)

    async def list_by_client(self, client_id: UUID) -> list[Payment]:
        # Клиент проверяем через наличие заказов не обязательно — вернём пусто, если нет
        return await self.repo.list_by_client(client_id)

    async def create_invoice(self, data: InvoiceCreate, created_by: UUID) -> Invoice:
        if data.amount <= 0:
            raise ValidationError("Invoice amount must be positive")
        await self.deal_repo.get_or_raise(data.deal_id)
        if data.issuer_company_id:
            await self.company_repo.get_or_raise(data.issuer_company_id)
        async with self.session.begin():
            invoice = await self.invoice_repo.create(
                deal_id=data.deal_id,
                issuer_company_id=data.issuer_company_id,
                amount=data.amount,
                due_date=data.due_date,
            )
            await write_audit_log(
                self.session,
                created_by,
                AuditAction.CREATE,
                "invoices",
                invoice.id,
                after={
                    "deal_id": str(data.deal_id),
                    "issuer_company_id": str(data.issuer_company_id) if data.issuer_company_id else None,
                    "amount": data.amount,
                    "due_date": str(data.due_date),
                },
            )
        return invoice

    async def list_invoices_by_deal(self, deal_id: UUID) -> list[Invoice]:
        await self.deal_repo.get_or_raise(deal_id)
        return await self.invoice_repo.list_by_deal(deal_id)

    async def init_online_payment(
        self, data: OnlinePaymentInitRequest, created_by: UUID
    ) -> OnlinePaymentInitResponse:
        if data.amount <= 0:
            raise ValidationError("Payment amount must be positive")
        await self.deal_repo.get_or_raise(data.deal_id)
        external_id = f"mock_{uuid4().hex}"
        payment_url = f"{data.return_url}?mock_payment_id={external_id}"
        async with self.session.begin():
            payment = await self.repo.create(
                deal_id=data.deal_id,
                amount=data.amount,
                method=PaymentMethod.ONLINE,
                status=PaymentTxStatus.PENDING,
                external_id=external_id,
                notes="online init",
            )
            await write_audit_log(
                self.session,
                created_by,
                AuditAction.CREATE,
                "payments",
                payment.id,
                after={
                    "deal_id": str(data.deal_id),
                    "amount": data.amount,
                    "method": PaymentMethod.ONLINE.value,
                    "status": PaymentTxStatus.PENDING.value,
                    "external_id": external_id,
                    "provider": "mock",
                },
            )
        logger.info(
            "payment.online_init",
            deal_id=str(data.deal_id),
            amount=data.amount,
            external_id=external_id,
            has_yookassa=bool(settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY),
        )
        return OnlinePaymentInitResponse(
            payment_id=payment.id,
            payment_url=payment_url,
            external_id=external_id,
        )
