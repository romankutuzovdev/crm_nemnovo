from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import BookingStatus


class RentCatalogItemCreate(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    unit_label: str | None = Field(default=None, max_length=50)
    default_unit_price: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool = True


class RentCatalogItemUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit_label: str | None = Field(default=None, max_length=50)
    default_unit_price: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool | None = None


class RentCatalogItemResponse(UUIDSchema):
    name: str
    unit_label: str | None
    default_unit_price: float | None
    description: str | None
    is_active: bool
    created_at: datetime


class RentOrderLineInput(BaseSchema):
    catalog_item_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=500)
    quantity: int = Field(default=1, ge=1, le=9999)
    unit_price: float = Field(..., ge=0)


class RentOrderLineResponse(UUIDSchema):
    order_id: UUID
    catalog_item_id: UUID | None
    title: str
    quantity: int
    unit_price: float
    line_total: float


class RentOrderCreate(BaseSchema):
    service_date: date
    deal_id: UUID | None = None
    status: str = BookingStatus.PENDING
    notes: str | None = None
    lines: list[RentOrderLineInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_lines(self):
        if not self.lines:
            raise ValueError("Добавьте хотя бы одну позицию")
        return self


class RentOrderUpdate(BaseSchema):
    service_date: date | None = None
    deal_id: UUID | None = None
    status: str | None = None
    notes: str | None = None
    lines: list[RentOrderLineInput] | None = None

    @model_validator(mode="after")
    def lines_not_empty(self):
        if self.lines is not None and len(self.lines) == 0:
            raise ValueError("Добавьте хотя бы одну позицию")
        return self


class RentOrderResponse(UUIDSchema):
    service_date: date
    deal_id: UUID | None
    status: str
    total_amount: float
    notes: str | None
    created_at: datetime
    lines: list[RentOrderLineResponse] = Field(default_factory=list)


def summarize_lines(lines: list[RentOrderLineInput | dict]) -> tuple[list[dict], float]:
    out: list[dict] = []
    total = Decimal("0")
    for raw in lines:
        if isinstance(raw, RentOrderLineInput):
            d = raw.model_dump()
        else:
            d = dict(raw)
        lt = Decimal(str(d["unit_price"])) * int(d["quantity"])
        d["line_total"] = float(lt)
        total += lt
        out.append(d)
    return out, float(total)
