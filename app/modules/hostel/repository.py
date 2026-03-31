from datetime import date
from uuid import UUID

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.hostel.models import HostelBooking, HostelGuest, HostelRoom
from app.shared.base_repository import BaseRepository
from app.shared.enums import BookingStatus


def compute_hostel_booking_total(
    check_in: date, check_out: date, guests_count: int, price_per_person_per_night: float
) -> float:
    nights = (check_out - check_in).days
    if nights < 1:
        raise ValidationError("Нужна минимум одна ночь")
    return round(float(guests_count) * nights * float(price_per_person_per_night), 2)


class HostelRoomRepository(BaseRepository[HostelRoom]):
    model = HostelRoom

    async def list(self, offset: int = 0, limit: int = 50) -> list[HostelRoom]:
        result = await self.session.execute(
            select(HostelRoom).order_by(HostelRoom.code.asc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_code(self, code: str) -> HostelRoom | None:
        result = await self.session.execute(select(HostelRoom).where(HostelRoom.code == code))
        return result.scalar_one_or_none()


class HostelBookingRepository(BaseRepository[HostelBooking]):
    model = HostelBooking

    async def get_with_guests(self, booking_id: UUID) -> HostelBooking | None:
        result = await self.session.execute(
            select(HostelBooking)
            .options(selectinload(HostelBooking.guests))
            .where(HostelBooking.id == booking_id)
        )
        return result.scalar_one_or_none()

    async def get_with_guests_or_raise(self, booking_id: UUID) -> HostelBooking:
        b = await self.get_with_guests(booking_id)
        if b is None:
            raise NotFoundError(f"HostelBooking {booking_id} not found")
        return b

    async def has_overlap(
        self,
        room_id: UUID,
        check_in: date,
        check_out: date,
        exclude_booking_id: UUID | None = None,
    ) -> bool:
        conds = [
            HostelBooking.room_id == room_id,
            HostelBooking.status != BookingStatus.CANCELLED,
            HostelBooking.check_in < check_out,
            HostelBooking.check_out > check_in,
        ]
        if exclude_booking_id is not None:
            conds.append(HostelBooking.id != exclude_booking_id)
        result = await self.session.execute(select(HostelBooking.id).where(and_(*conds)).limit(1))
        return result.scalar_one_or_none() is not None

    async def list_filtered(
        self,
        *,
        room_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[HostelBooking]:
        stmt = select(HostelBooking).options(selectinload(HostelBooking.guests))
        if room_id is not None:
            stmt = stmt.where(HostelBooking.room_id == room_id)
        if date_from is not None:
            stmt = stmt.where(HostelBooking.check_out > date_from)
        if date_to is not None:
            stmt = stmt.where(HostelBooking.check_in < date_to)
        stmt = stmt.order_by(HostelBooking.check_in.desc(), HostelBooking.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def create_with_guests(
        self,
        *,
        room_id: UUID,
        deal_id: UUID | None,
        check_in: date,
        check_out: date,
        guests_count: int,
        price_per_person_per_night: float,
        total_amount: float,
        status: str,
        notes: str | None,
        guests: list[dict],
    ) -> HostelBooking:
        if await self.has_overlap(room_id, check_in, check_out):
            raise ConflictError("Номер занят на выбранные даты")
        booking = HostelBooking(
            room_id=room_id,
            deal_id=deal_id,
            check_in=check_in,
            check_out=check_out,
            guests_count=guests_count,
            price_per_person_per_night=price_per_person_per_night,
            total_amount=total_amount,
            status=status,
            notes=notes,
        )
        self.session.add(booking)
        await self.session.flush()
        for g in guests:
            self.session.add(
                HostelGuest(
                    booking_id=booking.id,
                    full_name=g["full_name"],
                    phone=g.get("phone"),
                    id_document=g.get("id_document"),
                )
            )
        await self.session.flush()
        await self.session.refresh(booking)
        return await self.get_with_guests_or_raise(booking.id)

    async def apply_booking_patch(self, booking_id: UUID, raw: dict) -> HostelBooking:
        booking = await self.get_with_guests_or_raise(booking_id)
        new_room = raw.get("room_id", booking.room_id)
        new_in = raw.get("check_in", booking.check_in)
        new_out = raw.get("check_out", booking.check_out)
        if new_out <= new_in:
            raise ConflictError("Дата выезда должна быть позже заезда")
        if await self.has_overlap(new_room, new_in, new_out, exclude_booking_id=booking_id):
            raise ConflictError("Номер занят на выбранные даты")

        manual_total = raw["total_amount"] if "total_amount" in raw else None

        if "room_id" in raw:
            booking.room_id = raw["room_id"]
        if "deal_id" in raw:
            booking.deal_id = raw["deal_id"]
        if "check_in" in raw:
            booking.check_in = raw["check_in"]
        if "check_out" in raw:
            booking.check_out = raw["check_out"]
        if "guests_count" in raw:
            booking.guests_count = raw["guests_count"]
        if "price_per_person_per_night" in raw:
            booking.price_per_person_per_night = raw["price_per_person_per_night"]
        if "status" in raw:
            booking.status = raw["status"]
        if "notes" in raw:
            booking.notes = raw["notes"]

        if "guests" in raw:
            guests = raw["guests"]
            if not guests:
                raise ValidationError("Добавьте хотя бы одного гостя")
            if booking.guests_count < len(guests):
                raise ValidationError("Число проживающих не меньше количества записей гостей")
            await self.session.execute(delete(HostelGuest).where(HostelGuest.booking_id == booking_id))
            for g in guests:
                self.session.add(
                    HostelGuest(
                        booking_id=booking_id,
                        full_name=g["full_name"],
                        phone=g.get("phone"),
                        id_document=g.get("id_document"),
                    )
                )

        if manual_total is not None:
            booking.total_amount = manual_total
        elif booking.price_per_person_per_night is not None and any(
            k in raw for k in ("check_in", "check_out", "guests_count", "price_per_person_per_night")
        ):
            booking.total_amount = compute_hostel_booking_total(
                booking.check_in,
                booking.check_out,
                booking.guests_count,
                float(booking.price_per_person_per_night),
            )

        await self.session.flush()
        guest_row_count = await self.session.scalar(
            select(func.count()).select_from(HostelGuest).where(HostelGuest.booking_id == booking_id)
        )
        if guest_row_count and booking.guests_count < int(guest_row_count):
            raise ValidationError("Число проживающих не меньше количества записей гостей")

        return await self.get_with_guests_or_raise(booking_id)
