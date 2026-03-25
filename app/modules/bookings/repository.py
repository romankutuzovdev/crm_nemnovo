from uuid import UUID

from sqlalchemy import select

from app.modules.bookings.models import Booking
from app.shared.base_repository import BaseRepository


class BookingRepository(BaseRepository[Booking]):
    model = Booking

    async def get_by_id_and_deal(self, booking_id: UUID, deal_id: UUID) -> Booking | None:
        result = await self.session.execute(
            select(Booking).where(Booking.id == booking_id, Booking.deal_id == deal_id)
        )
        return result.scalar_one_or_none()

    async def list_by_deal(self, deal_id: UUID) -> list[Booking]:
        result = await self.session.execute(
            select(Booking).where(Booking.deal_id == deal_id).order_by(Booking.start_datetime.asc())
        )
        return list(result.scalars().all())

