import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID
from app.shared.enums import BookingStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RentCatalogItem(Base):
    __tablename__ = "rent_catalog_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_unit_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RentOrder(Base):
    __tablename__ = "rent_orders"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(30), default=BookingStatus.PENDING, nullable=False, index=True)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    lines: Mapped[list["RentOrderLine"]] = relationship(
        "RentOrderLine", back_populates="order", cascade="all, delete-orphan"
    )


class RentOrderLine(Base):
    __tablename__ = "rent_order_lines"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("rent_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalog_item_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("rent_catalog_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped["RentOrder"] = relationship("RentOrder", back_populates="lines")
