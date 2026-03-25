from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.deals.service import DealService
from app.modules.orders.schemas import OrderCreate, OrderUpdate


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

