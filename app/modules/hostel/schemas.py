from datetime import date, datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import BookingStatus


class HostelRoomCreate(BaseSchema):
    code: str = Field(..., min_length=1, max_length=30)
    title: str | None = None
    capacity: int = Field(default=2, ge=1, le=50)
    floor: int | None = None
    base_price_per_night: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool = True


class HostelRoomUpdate(BaseSchema):
    code: str | None = Field(default=None, min_length=1, max_length=30)
    title: str | None = None
    capacity: int | None = Field(default=None, ge=1, le=50)
    floor: int | None = None
    base_price_per_night: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool | None = None


class HostelRoomResponse(UUIDSchema):
    code: str
    title: str | None
    capacity: int
    floor: int | None
    base_price_per_night: float | None
    description: str | None
    is_active: bool
    created_at: datetime


class HostelGuestInput(BaseSchema):
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    id_document: str | None = Field(default=None, max_length=120)


class HostelGuestResponse(UUIDSchema):
    booking_id: UUID
    full_name: str
    phone: str | None
    id_document: str | None


class HostelBookingCreate(BaseSchema):
    room_id: UUID
    deal_id: UUID | None = None
    check_in: date
    check_out: date
    total_amount: float = Field(..., ge=0)
    status: str = BookingStatus.PENDING
    notes: str | None = None
    guests: list[HostelGuestInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dates_and_guests(self):
        if self.check_out <= self.check_in:
            raise ValueError("Дата выезда должна быть позже заезда")
        if not self.guests:
            raise ValueError("Добавьте хотя бы одного гостя")
        return self


class HostelBookingUpdate(BaseSchema):
    room_id: UUID | None = None
    deal_id: UUID | None = None
    check_in: date | None = None
    check_out: date | None = None
    total_amount: float | None = Field(default=None, ge=0)
    status: str | None = None
    notes: str | None = None
    guests: list[HostelGuestInput] | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        cin, cout = self.check_in, self.check_out
        if cin is not None and cout is not None and cout <= cin:
            raise ValueError("Дата выезда должна быть позже заезда")
        return self


class HostelBookingResponse(UUIDSchema):
    room_id: UUID
    deal_id: UUID | None
    check_in: date
    check_out: date
    total_amount: float
    status: str
    notes: str | None
    created_at: datetime
    guests: list[HostelGuestResponse] = Field(default_factory=list)
