import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, event
from app.db.types import GUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.shared.enums import DealItemKind, DealStatus, PaymentStatus, ServiceType


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    service_type: Mapped[str] = mapped_column(String(50), default=ServiceType.RAFTING, nullable=False)
    tour_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tour_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tour_status: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default=DealStatus.NEW, nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    guests_count: Mapped[int] = mapped_column(Integer, default=1)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    payment_status: Mapped[str] = mapped_column(
        String(30), default=PaymentStatus.UNPAID, nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    contract_text: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # произвольный текст (номер вне справочника, уточнение)
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items: Mapped[list["DealItem"]] = relationship(
        "DealItem", back_populates="deal", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship("Booking", back_populates="deal")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="deal")
    client: Mapped["Client"] = relationship("Client", back_populates="deals")
    contract = relationship("Contract", back_populates="deals", foreign_keys=[contract_id])
    assigned_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[assigned_to],
        overlaps="created_by_user",
    )
    created_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by],
        overlaps="assigned_user",
    )

    @property
    def client_name(self) -> str | None:
        c = self.client
        if c is None:
            return None
        return f"{c.first_name} {c.last_name}".strip()

    @property
    def assigned_user_name(self) -> str | None:
        u = self.assigned_user
        if u is None:
            return None
        return u.full_name

    @property
    def debt_amount(self) -> float:
        return float(self.total_amount) - float(self.paid_amount)

    @property
    def contract_number(self) -> str | None:
        c = self.contract
        return c.number if c else None

    @property
    def contract_company_name(self) -> str | None:
        c = self.contract
        if c is None or c.company is None:
            return None
        return c.company.name

    def recalculate_payment_status(self) -> None:
        paid = float(self.paid_amount)
        total = float(self.total_amount)
        if paid == 0:
            self.payment_status = PaymentStatus.UNPAID
        elif paid < total:
            self.payment_status = PaymentStatus.PARTIAL
        elif paid == total:
            self.payment_status = PaymentStatus.PAID
        else:
            self.payment_status = PaymentStatus.OVERPAID

    def __repr__(self) -> str:
        number = self.__dict__.get("number", "<detached>")
        status = self.__dict__.get("status", "<detached>")
        return f"<Deal {number} status={status}>"


# В терминах ТЗ "Заказ" — основная сущность.
# Пока оставляем таблицу `deals`, но даём доменное имя Order.
Order = Deal


class DealItem(Base):
    __tablename__ = "deal_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    item_kind: Mapped[str] = mapped_column(
        String(20), default=DealItemKind.PRIMARY, nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    deal: Mapped[Deal] = relationship("Deal", back_populates="items")
    item_client: Mapped["Client | None"] = relationship(
        "Client",
        foreign_keys=[client_id],
    )

    @property
    def client_name(self) -> str | None:
        if self.client_id is None:
            return None
        c = self.item_client
        if c is None:
            return None
        return f"{c.first_name} {c.last_name}".strip()


OrderItem = DealItem


from app.modules.bookings.models import Booking  # noqa: E402
from app.modules.payments.models import Payment  # noqa: E402
