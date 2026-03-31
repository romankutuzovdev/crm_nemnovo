from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import AssetConflictError, NotFoundError, ValidationError
from app.modules.assets.repository import AssetRepository
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import BookingRepository
from app.modules.bookings.schemas import BookingCreate, BookingUpdate
from app.modules.deals.repository import DealRepository
from app.shared.enums import AuditAction, BookingStatus, DealStatus


class BookingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = BookingRepository(session)
        self.asset_repo = AssetRepository(session)
        self.deal_repo = DealRepository(session)

    async def create_for_order(self, order_id: UUID, data: BookingCreate, created_by: UUID) -> Booking:
        order = await self.deal_repo.get_or_raise(order_id)

        asset = await self.asset_repo.get_or_raise(data.asset_id)
        if data.start_datetime >= data.end_datetime:
            raise ValidationError("start_datetime must be < end_datetime")
        conflict = await self.asset_repo.has_conflict(data.asset_id, data.start_datetime, data.end_datetime)
        if conflict:
            raise AssetConflictError(asset.name)

        booking_status = (
            BookingStatus.PENDING
            if order.status == DealStatus.NEW.value
            else BookingStatus.CONFIRMED
        )

        booking = Booking(
            deal_id=order.id,
            asset_id=data.asset_id,
            start_datetime=data.start_datetime,
            end_datetime=data.end_datetime,
            quantity=data.quantity,
            status=booking_status,
        )
        self.session.add(booking)
        await self.session.flush()

        await write_audit_log(
            self.session,
            created_by,
            AuditAction.CREATE,
            "bookings",
            booking.id,
            after={
                "order_id": str(order.id),
                "asset_id": str(booking.asset_id),
                "start": booking.start_datetime.isoformat(),
                "end": booking.end_datetime.isoformat(),
            },
        )
        return booking

    async def update_for_order(
        self, order_id: UUID, booking_id: UUID, data: BookingUpdate, updated_by: UUID
    ) -> Booking:
        booking = await self.repo.get_by_id_and_deal(booking_id, order_id)
        if not booking:
            raise NotFoundError("Бронирование не найдено")

        update = data.model_dump(exclude_none=True)
        start = update.get("start_datetime", booking.start_datetime)
        end = update.get("end_datetime", booking.end_datetime)
        asset_id = booking.asset_id

        if start >= end:
            raise ValidationError("start_datetime must be < end_datetime")

        # Проверка пересечений (важно по ТЗ)
        asset = await self.asset_repo.get_or_raise(asset_id)
        conflict = await self.asset_repo.has_conflict(asset_id, start, end, exclude_booking_id=booking_id)
        if conflict:
            raise AssetConflictError(asset.name)

        for k, v in update.items():
            setattr(booking, k, v)

        await write_audit_log(
            self.session,
            updated_by,
            AuditAction.UPDATE,
            "bookings",
            booking.id,
            after={k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in update.items()},
        )
        return booking

    async def cancel_for_order(self, order_id: UUID, booking_id: UUID, cancelled_by: UUID) -> Booking:
        booking = await self.repo.get_by_id_and_deal(booking_id, order_id)
        if not booking:
            raise NotFoundError("Бронирование не найдено")

        booking.status = BookingStatus.CANCELLED
        await write_audit_log(
            self.session,
            cancelled_by,
            AuditAction.UPDATE,
            "bookings",
            booking.id,
            after={"status": BookingStatus.CANCELLED},
        )
        return booking

