import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID
from app.shared.enums import BookingStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RaftingRoute(Base):
    __tablename__ = "rafting_routes"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. "I-II", "III"
    duration_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Ориентир для менеджера: подставляется в новый сплав как цена с человека (можно изменить).
    default_price_per_person: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RaftingInstructor(Base):
    __tablename__ = "rafting_instructors"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    passport_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Выплаты инструктору (ИП): фикс за сплав + ставка за гостя.
    payout_per_trip: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    payout_per_guest: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class TransportVehicle(Base):
    __tablename__ = "transport_vehicles"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    brand: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    plate_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trip_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    driver_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RaftingTrip(Base):
    """Плановый сплав: маршрут, дата, связь с заказом CRM и назначенные ресурсы."""

    __tablename__ = "rafting_trips"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    route_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("rafting_routes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    instructor_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("rafting_instructors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    trip_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    trip_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    trip_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    guests_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=BookingStatus.PENDING, nullable=False, index=True)
    instructor_fee: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    instructor_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    instructor_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    instructor_paid_by: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

