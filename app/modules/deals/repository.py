from datetime import date
from typing import Any, List
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.modules.contracts.models import Contract
from app.modules.deals.models import Deal, DealItem
from app.shared.base_repository import BaseRepository
from app.shared.enums import DealStatus


class DealRepository(BaseRepository[Deal]):
    model = Deal

    @staticmethod
    def _response_load_options():
        return (
            selectinload(Deal.client),
            selectinload(Deal.assigned_user),
            selectinload(Deal.items).selectinload(DealItem.item_client),
            selectinload(Deal.bookings),
            selectinload(Deal.contract).selectinload(Contract.company),
        )

    async def list(
        self,
        filters: dict[str, Any] | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> List[Deal]:
        stmt = (
            select(Deal)
            .options(*self._response_load_options())
            .order_by(Deal.created_at.desc())
        )
        if filters:
            for key, value in filters.items():
                stmt = stmt.where(getattr(Deal, key) == value)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_next_number(self) -> str:
        from datetime import datetime
        year = datetime.now().year
        count = await self.count()
        from app.shared.utils import generate_deal_number
        return generate_deal_number(year, count + 1)

    async def get_with_relations(self, deal_id: UUID) -> Deal | None:
        result = await self.session.execute(
            select(Deal)
            .options(
                *self._response_load_options(),
                selectinload(Deal.payments),
            )
            .where(Deal.id == deal_id)
        )
        return result.scalar_one_or_none()

    async def find_by_number(self, number: str) -> Deal | None:
        result = await self.session.execute(
            select(Deal).options(*self._response_load_options()).where(Deal.number == number)
        )
        return result.scalar_one_or_none()

    async def list_by_client(self, client_id: UUID, offset: int = 0, limit: int = 50) -> List[Deal]:
        result = await self.session.execute(
            select(Deal)
            .options(*self._response_load_options())
            .where(Deal.client_id == client_id)
            .order_by(Deal.created_at.desc())
            .offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_manager(self, manager_id: UUID, offset: int = 0, limit: int = 50) -> List[Deal]:
        result = await self.session.execute(
            select(Deal)
            .options(*self._response_load_options())
            .where(Deal.assigned_to == manager_id)
            .order_by(Deal.created_at.desc())
            .offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_pending_approval(self, offset: int = 0, limit: int = 50) -> List[Deal]:
        """Новые заказы без ответственного — очередь на подтверждение менеджером."""
        result = await self.session.execute(
            select(Deal)
            .options(*self._response_load_options())
            .where(
                Deal.status == DealStatus.NEW.value,
                Deal.assigned_to.is_(None),
            )
            .order_by(Deal.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_pending_approval(self) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(Deal)
            .where(
                Deal.status == DealStatus.NEW.value,
                Deal.assigned_to.is_(None),
            )
        )
        return int(result.scalar_one())

    async def count_open_deals_for_manager(self, manager_id: UUID) -> int:
        """Активные сделки менеджера: new / confirmed / in_progress."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Deal)
            .where(
                Deal.assigned_to == manager_id,
                Deal.status.in_(
                    [
                        DealStatus.NEW.value,
                        DealStatus.CONFIRMED.value,
                        DealStatus.IN_PROGRESS.value,
                    ]
                ),
            )
        )
        return int(result.scalar_one())

    async def get_for_update(self, deal_id: UUID) -> Deal:
        from sqlalchemy import text
        result = await self.session.execute(
            select(Deal).where(Deal.id == deal_id).with_for_update()
        )
        deal = result.scalar_one_or_none()
        if not deal:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal

    async def sum_by_date_range(self, start: date, end: date) -> float:
        from app.shared.enums import PaymentStatus
        result = await self.session.execute(
            select(func.sum(Deal.total_amount))
            .where(Deal.start_date >= start)
            .where(Deal.start_date <= end)
            .where(Deal.status != DealStatus.CANCELLED)
        )
        return float(result.scalar_one() or 0)


class DealItemRepository(BaseRepository[DealItem]):
    model = DealItem
