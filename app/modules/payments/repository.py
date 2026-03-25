from uuid import UUID

from sqlalchemy import func, select

from app.modules.payments.models import Invoice, Payment
from app.modules.deals.models import Deal
from app.shared.base_repository import BaseRepository
from app.shared.enums import PaymentTxStatus


class PaymentRepository(BaseRepository[Payment]):
    model = Payment

    async def get_by_external_id(self, external_id: str) -> Payment | None:
        result = await self.session.execute(
            select(Payment).where(Payment.external_id == external_id)
        )
        return result.scalar_one_or_none()

    async def list_by_deal(self, deal_id: UUID) -> list[Payment]:
        result = await self.session.execute(
            select(Payment)
            .where(Payment.deal_id == deal_id)
            .order_by(Payment.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_client(self, client_id: UUID) -> list[Payment]:
        result = await self.session.execute(
            select(Payment)
            .join(Deal, Deal.id == Payment.deal_id)
            .where(Deal.client_id == client_id)
            .order_by(Payment.created_at.desc())
        )
        return list(result.scalars().all())

    async def sum_confirmed_by_deal(self, deal_id: UUID) -> float:
        result = await self.session.execute(
            select(func.sum(Payment.amount))
            .where(Payment.deal_id == deal_id)
            .where(Payment.status == PaymentTxStatus.CONFIRMED)
        )
        return float(result.scalar_one() or 0)


class InvoiceRepository(BaseRepository[Invoice]):
    model = Invoice
