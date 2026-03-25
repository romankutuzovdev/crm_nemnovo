import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import JSON
from app.db.types import GUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.shared.enums import CompanySegment


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    inn: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    segment: Mapped[str] = mapped_column(
        String(10), default=CompanySegment.B2B.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    clients: Mapped[list["Client"]] = relationship("Client", back_populates="company")

    def __repr__(self) -> str:
        return f"<Company {self.name}>"


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(50), default="manual")  # site | phone | referral
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    company: Mapped[Company | None] = relationship("Company", back_populates="clients")
    notes: Mapped[list["ClientNote"]] = relationship(
        "ClientNote", back_populates="client", cascade="all, delete-orphan"
    )
    deals: Mapped[list["Deal"]] = relationship("Deal", back_populates="client")

    def __repr__(self) -> str:
        return f"<Client {self.first_name} {self.last_name}>"


class ClientNote(Base):
    __tablename__ = "client_notes"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    client: Mapped[Client] = relationship("Client", back_populates="notes")
