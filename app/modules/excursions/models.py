import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID
from app.shared.enums import ExcursionStatus, PaymentStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExcursionGuide(Base):
    """Справочник экскурсоводов (отдельно от инструкторов сплава)."""

    __tablename__ = "excursion_guides"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    passport_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    excursions: Mapped[list["Excursion"]] = relationship("Excursion", back_populates="guide")


class Excursion(Base):
    """Экскурсия / мероприятие: программа, транспорт, финансы, клиенты."""

    __tablename__ = "excursions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    excursion_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default=ExcursionStatus.DRAFT, nullable=False, index=True)
    payment_status: Mapped[str] = mapped_column(
        String(30), default=PaymentStatus.UNPAID, nullable=False, index=True
    )

    guide_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("excursion_guides.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    payer_company_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )

    income_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    expense_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    transport_income: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    transport_expense: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    guide_fee: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    guide: Mapped["ExcursionGuide | None"] = relationship("ExcursionGuide", back_populates="excursions")
    program_steps: Mapped[list["ExcursionProgramStep"]] = relationship(
        "ExcursionProgramStep",
        back_populates="excursion",
        cascade="all, delete-orphan",
    )
    client_links: Mapped[list["ExcursionClientLink"]] = relationship(
        "ExcursionClientLink",
        back_populates="excursion",
        cascade="all, delete-orphan",
    )


class ExcursionProgramStep(Base):
    """Пункт программы по времени."""

    __tablename__ = "excursion_program_steps"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    excursion_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("excursions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    excursion: Mapped["Excursion"] = relationship("Excursion", back_populates="program_steps")
    objects: Mapped[list["ExcursionProgramObject"]] = relationship(
        "ExcursionProgramObject",
        back_populates="step",
        cascade="all, delete-orphan",
    )


class ExcursionProgramObject(Base):
    """Объект в пункте программы (площадка, билет и т.п.): вместимость и стоимость."""

    __tablename__ = "excursion_program_objects"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    step_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("excursion_program_steps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    step: Mapped["ExcursionProgramStep"] = relationship("ExcursionProgramStep", back_populates="objects")


class ExcursionClientLink(Base):
    """Участники экскурсии — связь с карточками клиентов CRM."""

    __tablename__ = "excursion_client_links"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    excursion_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("excursions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    guests_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (UniqueConstraint("excursion_id", "client_id", name="uq_excursion_client"),)

    excursion: Mapped["Excursion"] = relationship("Excursion", back_populates="client_links")
