import uuid
from datetime import date, datetime, timezone

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID
from app.shared.enums import BookingStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class HostelRoom(Base):
    __tablename__ = "hostel_rooms"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_price_per_night: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    bookings: Mapped[list["HostelBooking"]] = relationship("HostelBooking", back_populates="room")


class HostelBooking(Base):
    __tablename__ = "hostel_bookings"
    __table_args__ = (
        CheckConstraint("check_in < check_out", name="ck_hostel_booking_dates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("hostel_rooms.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    check_in: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    guests_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    price_per_person_per_night: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=BookingStatus.PENDING, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    room: Mapped["HostelRoom"] = relationship("HostelRoom", back_populates="bookings")
    guests: Mapped[list["HostelGuest"]] = relationship(
        "HostelGuest", back_populates="booking", cascade="all, delete-orphan"
    )


class HostelGuest(Base):
    __tablename__ = "hostel_guests"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("hostel_bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    id_document: Mapped[str | None] = mapped_column(String(120), nullable=True)

    booking: Mapped["HostelBooking"] = relationship("HostelBooking", back_populates="guests")
