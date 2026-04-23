from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.audit import write_audit_log
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.clients.repository import ClientRepository, CompanyRepository
from app.modules.deals.repository import DealRepository
from app.modules.payments.models import Invoice, Payment, PaymentAllocation
from app.modules.payments.repository import InvoiceRepository, PaymentAllocationRepository, PaymentRepository
from app.modules.payments.schemas import (
    InvoiceCreate,
    OnlinePaymentInitRequest,
    OnlinePaymentInitResponse,
    OrderClientFinanceRow,
    PaymentAllocationCreate,
    PaymentCreate,
)
from app.shared.enums import AuditAction, PaymentMethod, PaymentTxStatus

logger = structlog.get_logger()


class PaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PaymentRepository(session)
        self.invoice_repo = InvoiceRepository(session)
        self.allocation_repo = PaymentAllocationRepository(session)
        self.deal_repo = DealRepository(session)
        self.client_repo = ClientRepository(session)
        self.company_repo = CompanyRepository(session)

    @asynccontextmanager
    async def _tx(self):
        """Open transaction only if session has none."""
        if self.session.in_transaction():
            yield
            return
        async with self.session.begin():
            yield

    async def _replace_allocations(
        self,
        payment: Payment,
        allocations: list[PaymentAllocationCreate],
    ) -> None:
        await self.session.execute(
            delete(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id)
        )
        if not allocations:
            return
        total = 0.0
        for a in allocations:
            if a.amount <= 0:
                raise ValidationError("Allocation amount must be positive")
            await self.client_repo.get_or_raise(a.client_id)
            total += float(a.amount)
            self.session.add(
                PaymentAllocation(
                    payment_id=payment.id,
                    client_id=a.client_id,
                    amount=a.amount,
                    comment=a.comment,
                )
            )
        if total > float(payment.amount) + 1e-9:
            raise ValidationError("Sum of allocations cannot exceed payment amount")
        await self.session.flush()

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
        await self._replace_allocations(payment, data.allocations or [])

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
        return await self.repo.get_with_allocations(payment.id) or payment

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
        return await self.repo.get_with_allocations(payment_id) or payment

    async def list_by_deal(self, deal_id: UUID) -> list[Payment]:
        await self.deal_repo.get_or_raise(deal_id)
        return await self.repo.list_by_deal(deal_id)

    async def set_allocations(
        self,
        payment_id: UUID,
        allocations: list[PaymentAllocationCreate],
        updated_by: UUID,
    ) -> Payment:
        payment = await self.repo.get_or_raise(payment_id)
        await self._replace_allocations(payment, allocations)
        await write_audit_log(
            self.session,
            updated_by,
            AuditAction.UPDATE,
            "payments",
            payment.id,
            after={
                "allocations_count": len(allocations),
                "allocations_sum": sum(float(a.amount) for a in allocations),
            },
        )
        return await self.repo.get_with_allocations(payment_id) or payment

    async def list_by_client(self, client_id: UUID) -> list[Payment]:
        # Клиент проверяем через наличие заказов не обязательно — вернём пусто, если нет
        return await self.repo.list_by_client(client_id)

    async def order_client_finance(self, deal_id: UUID) -> list[OrderClientFinanceRow]:
        from app.modules.clients.models import Client
        from app.modules.deals.models import DealItem
        from app.shared.enums import PaymentTxStatus

        deal = await self.deal_repo.get_or_raise(deal_id)
        primary_client_id = deal.client_id

        charged_stmt = (
            select(
                func.coalesce(DealItem.client_id, primary_client_id).label("client_id"),
                func.coalesce(func.sum(DealItem.total_price), 0).label("charged"),
            )
            .where(DealItem.deal_id == deal_id)
            .group_by(func.coalesce(DealItem.client_id, primary_client_id))
        )
        paid_stmt = (
            select(
                PaymentAllocation.client_id.label("client_id"),
                func.coalesce(func.sum(PaymentAllocation.amount), 0).label("paid"),
            )
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .where(
                Payment.deal_id == deal_id,
                Payment.status == PaymentTxStatus.CONFIRMED,
            )
            .group_by(PaymentAllocation.client_id)
        )

        charged_rows = (await self.session.execute(charged_stmt)).all()
        paid_rows = (await self.session.execute(paid_stmt)).all()
        charged_map = {r.client_id: float(r.charged or 0) for r in charged_rows}
        paid_map = {r.client_id: float(r.paid or 0) for r in paid_rows}
        client_ids = list(set(charged_map.keys()) | set(paid_map.keys()))
        if not client_ids:
            return []

        client_rows = (
            await self.session.execute(
                select(Client.id, Client.first_name, Client.last_name).where(Client.id.in_(client_ids))
            )
        ).all()
        names = {cid: f"{fn} {ln}".strip() for cid, fn, ln in client_rows}

        rows: list[OrderClientFinanceRow] = []
        for cid in client_ids:
            charged = charged_map.get(cid, 0.0)
            paid = paid_map.get(cid, 0.0)
            rows.append(
                OrderClientFinanceRow(
                    client_id=cid,
                    client_name=names.get(cid),
                    charged_amount=round(charged, 2),
                    paid_amount=round(paid, 2),
                    debt_amount=round(charged - paid, 2),
                )
            )
        rows.sort(key=lambda x: (x.client_name or ""))
        return rows

    async def create_invoice(self, data: InvoiceCreate, created_by: UUID) -> Invoice:
        if data.amount <= 0:
            raise ValidationError("Invoice amount must be positive")
        await self.deal_repo.get_or_raise(data.deal_id)
        if data.issuer_company_id:
            await self.company_repo.get_or_raise(data.issuer_company_id)
        async with self._tx():
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
        async with self._tx():
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
