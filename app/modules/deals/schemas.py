from datetime import date, datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import DealStatus, PaymentStatus, ServiceType


class DealItemCreate(BaseSchema):
    asset_id: UUID | None = None
    product_id: UUID | None = None
    description: str
    quantity: int = 1
    unit_price: float

    @property
    def total_price(self) -> float:
        return self.quantity * self.unit_price


class DealItemResponse(UUIDSchema):
    description: str
    quantity: int
    unit_price: float
    total_price: float


class BookingInDealCreate(BaseSchema):
    asset_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    quantity: int = 1


class DealCreate(BaseSchema):
    client_id: UUID
    lead_id: UUID | None = None
    service_type: ServiceType
    start_date: date
    end_date: date
    guests_count: int = 1
    notes: str | None = None
    items: list[DealItemCreate]
    bookings: list[BookingInDealCreate] = []


class DealUpdate(BaseSchema):
    status: DealStatus | None = None
    assigned_to: UUID | None = None
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    guests_count: int | None = None


class DealResponse(UUIDSchema):
    number: str
    client_id: UUID
    lead_id: UUID | None
    assigned_to: UUID | None
    service_type: str
    status: str
    start_date: date
    end_date: date
    guests_count: int
    total_amount: float
    paid_amount: float
    debt_amount: float
    payment_status: str
    notes: str | None
    items: list[DealItemResponse]
    created_at: datetime
    updated_at: datetime
