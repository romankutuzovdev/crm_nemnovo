from datetime import date, datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema, UUIDSchema
from pydantic import Field, field_validator

from app.shared.enums import DealItemKind, DealStatus, PaymentStatus, ServiceType


class DealItemCreate(BaseSchema):
    asset_id: UUID | None = None
    product_id: UUID | None = None
    client_id: UUID | None = None
    description: str
    item_kind: str = DealItemKind.PRIMARY.value
    quantity: int = 1
    unit_price: float

    @property
    def total_price(self) -> float:
        return self.quantity * self.unit_price

    @field_validator("item_kind")
    @classmethod
    def validate_item_kind(cls, v: str) -> str:
        allowed = {DealItemKind.PRIMARY.value, DealItemKind.ADDON.value}
        if v not in allowed:
            raise ValueError(f"item_kind должен быть одним из: {', '.join(sorted(allowed))}")
        return v


class DealItemResponse(UUIDSchema):
    description: str
    item_kind: str
    quantity: int
    unit_price: float
    total_price: float
    client_id: UUID | None = None
    client_name: str | None = None


class DealItemUpdate(BaseSchema):
    description: str | None = None
    item_kind: str | None = None
    quantity: int | None = Field(None, ge=1)
    unit_price: float | None = Field(None, ge=0)

    @field_validator("item_kind")
    @classmethod
    def validate_item_kind_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        allowed = {DealItemKind.PRIMARY.value, DealItemKind.ADDON.value}
        if v not in allowed:
            raise ValueError(f"item_kind должен быть одним из: {', '.join(sorted(allowed))}")
        return v


class BookingResponse(UUIDSchema):
    asset_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    quantity: int
    status: str


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
    contract_id: UUID | None = None
    contract_text: str | None = None
    items: list[DealItemCreate]
    bookings: list[BookingInDealCreate] = []


class DealUpdate(BaseSchema):
    status: DealStatus | None = None
    assigned_to: UUID | None = None
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    guests_count: int | None = None
    contract_id: UUID | None = None
    contract_text: str | None = None


class DealResponse(UUIDSchema):
    number: str
    client_id: UUID
    client_name: str | None = None
    lead_id: UUID | None
    assigned_to: UUID | None
    assigned_user_name: str | None = None
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
    contract_id: UUID | None = None
    contract_text: str | None = None
    contract_number: str | None = None
    contract_company_name: str | None = None
    items: list[DealItemResponse]
    bookings: list[BookingResponse] = []
    created_at: datetime
    updated_at: datetime
