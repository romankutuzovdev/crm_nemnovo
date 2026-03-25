from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.deals.repository import DealRepository
from app.modules.payments.models import Payment
from app.modules.payments.repository import PaymentRepository
from app.modules.payments.schemas import PaymentCreate
from app.shared.enums import AuditAction, PaymentTxStatus

logger = structlog.get_logger()


class PaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PaymentRepository(session)
        self.deal_repo = DealRepository(session)

    async def create_payment(self, data: PaymentCreate, confirmed_by: UUID) -> Payment:
        if data.amount <= 0:
            raise ValidationError("Payment amount must be positive")

        async with self.session.begin():
            # Pessimistic lock to prevent race conditions
            deal = await self.deal_repo.get_for_update(data.deal_id)

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

            # Update deal aggregates
            new_paid = float(deal.paid_amount) + data.amount
            deal.paid_amount = new_paid
            deal.recalculate_payment_status()

            await write_audit_log(
                self.session, confirmed_by, AuditAction.CREATE, "payments", payment.id,
                after={
                    "deal_id": str(data.deal_id),
                    "amount": data.amount,
                    "method": data.method,
                    "new_deal_paid": new_paid,
                    "new_deal_status": deal.payment_status,
                },
            )

        logger.info(
            "payment.created",
            payment_id=str(payment.id),
            deal_id=str(data.deal_id),
            amount=data.amount,
            new_status=deal.payment_status,
        )
        return payment

    async def confirm_online_payment(self, external_id: str) -> Payment:
        """Called from payment provider webhook."""
        payment = await self.repo.get_by_external_id(external_id)
        if not payment:
            raise NotFoundError(f"Payment with external_id {external_id} not found")

        if payment.status == PaymentTxStatus.CONFIRMED:
            return payment  # Idempotent

        async with self.session.begin():
            deal = await self.deal_repo.get_for_update(payment.deal_id)
            payment.status = PaymentTxStatus.CONFIRMED
            payment.paid_at = datetime.now(timezone.utc)

            deal.paid_amount = float(deal.paid_amount) + float(payment.amount)
            deal.recalculate_payment_status()

        logger.info("payment.confirmed_online", external_id=external_id)
        return payment

    async def refund_payment(self, payment_id: UUID, refunded_by: UUID) -> Payment:
        payment = await self.repo.get_or_raise(payment_id)
        if payment.status != PaymentTxStatus.CONFIRMED:
            raise ValidationError("Only confirmed payments can be refunded")

        async with self.session.begin():
            deal = await self.deal_repo.get_for_update(payment.deal_id)
            payment.status = PaymentTxStatus.REFUNDED
            deal.paid_amount = max(0.0, float(deal.paid_amount) - float(payment.amount))
            deal.recalculate_payment_status()

            await write_audit_log(
                self.session, refunded_by, AuditAction.UPDATE, "payments", payment_id,
                after={"status": PaymentTxStatus.REFUNDED},
            )

        logger.info("payment.refunded", payment_id=str(payment_id))
        return payment

    async def list_by_deal(self, deal_id: UUID) -> list[Payment]:
        await self.deal_repo.get_or_raise(deal_id)
        return await self.repo.list_by_deal(deal_id)
