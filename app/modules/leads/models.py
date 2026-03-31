import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from app.db.types import GUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.shared.enums import LeadSource, LeadStatus, ServiceType


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source: Mapped[str] = mapped_column(String(50), default=LeadSource.MANUAL, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)  # URL or call number
    status: Mapped[str] = mapped_column(String(30), default=LeadStatus.NEW, nullable=False, index=True)
    service_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preferred_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Preferred start datetime for calendar slot (optional; if set, preferred_date is kept in sync).
    # Stored as naive timestamp (no tz) because UI sends local time and DB uses naive timestamps in several places.
    preferred_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    guests_count: Mapped[int] = mapped_column(Integer, default=1)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    converted_deal_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True
    )
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    excursion_guide_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("excursion_guides.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    service_items: Mapped[list["LeadServiceItem"]] = relationship(
        "LeadServiceItem", back_populates="lead", cascade="all, delete-orphan"
    )

    @property
    def services(self) -> list["LeadServiceItem"]:
        # Backward/forward compatible name for API schemas/UI.
        return list(self.service_items or [])

    def __repr__(self) -> str:
        lead_id = self.__dict__.get("id", "<detached>")
        source = self.__dict__.get("source", "<detached>")
        status = self.__dict__.get("status", "<detached>")
        return f"<Lead {lead_id} source={source} status={status}>"


class LeadServiceItem(Base):
    __tablename__ = "lead_service_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    service_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="service_items")
