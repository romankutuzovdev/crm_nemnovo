from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.deals.service import DealService
from app.modules.deals.schemas import DealItemCreate, DealItemUpdate
from app.modules.orders.schemas import OrderAuditEntryResponse, OrderCreate, OrderUpdate
from app.shared.enums import DealStatus


class OrderService:
    """Сервис заказов поверх существующей реализации DealService."""

    def __init__(self, session: AsyncSession) -> None:
        self._deal = DealService(session)
        self.repo = self._deal.repo

    async def create_order(self, data: OrderCreate, created_by: UUID):
        return await self._deal.create_deal(data, created_by=created_by)

    async def update_order(self, order_id: UUID, data: OrderUpdate, updated_by: UUID):
        return await self._deal.update_deal(order_id, data, updated_by=updated_by)

    async def cancel_order(self, order_id: UUID, cancelled_by: UUID):
        return await self._deal.cancel_deal(order_id, cancelled_by=cancelled_by)

    async def get_order(self, order_id: UUID):
        return await self._deal.get_deal(order_id)

    async def get_order_by_number(self, number: str):
        deal = await self.repo.find_by_number(number.strip())
        if not deal:
            raise NotFoundError(f"Заказ с номером «{number.strip()}» не найден")
        return await self._deal.get_deal(deal.id)

    async def transition_status(self, order_id: UUID, status: DealStatus, updated_by: UUID):
        return await self._deal.transition_status(order_id, status=status, updated_by=updated_by)

    async def add_order_item(self, order_id: UUID, data: DealItemCreate, updated_by: UUID):
        return await self._deal.add_deal_item(order_id, data, updated_by)

    async def update_order_item(
        self, order_id: UUID, item_id: UUID, data: DealItemUpdate, updated_by: UUID
    ):
        return await self._deal.update_deal_item(order_id, item_id, data, updated_by)

    async def delete_order_item(self, order_id: UUID, item_id: UUID, updated_by: UUID):
        return await self._deal.delete_deal_item(order_id, item_id, updated_by)

    async def list_order_audit(self, order_id: UUID, limit: int = 50) -> list[OrderAuditEntryResponse]:
        await self.repo.get_or_raise(order_id)
        from app.modules.users.models import AuditLog, User

        result = await self._deal.session.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.resource == "deals", AuditLog.resource_id == order_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        rows: list[OrderAuditEntryResponse] = []
        for log, full_name in result.all():
            payload = log.after if log.after is not None else log.before
            parts = [f"{k}: {v}" for k, v in (payload or {}).items()]
            rows.append(
                OrderAuditEntryResponse(
                    id=log.id,
                    action=log.action,
                    user_name=full_name or "—",
                    created_at=log.created_at,
                    details=("; ".join(parts) if parts else "—")[:800],
                )
            )
        return rows

