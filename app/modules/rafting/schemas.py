from datetime import date, datetime, time
from uuid import UUID

from pydantic import Field, computed_field

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import BookingStatus


class RaftingRouteCreate(BaseSchema):
    name: str
    difficulty: str | None = None
    duration_hours: int | None = None
    default_price_per_person: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool = True


class RaftingRouteUpdate(BaseSchema):
    name: str | None = None
    difficulty: str | None = None
    duration_hours: int | None = None
    default_price_per_person: float | None = Field(default=None, ge=0)
    description: str | None = None
    is_active: bool | None = None


class RaftingRouteResponse(UUIDSchema):
    name: str
    difficulty: str | None
    duration_hours: int | None
    default_price_per_person: float | None = None
    description: str | None
    is_active: bool
    created_at: datetime


class RaftingInstructorCreate(BaseSchema):
    full_name: str
    phone: str | None = None
    passport_details: str | None = None
    notes: str | None = None
    payout_per_trip: float = Field(default=0, ge=0)
    payout_per_guest: float = Field(default=0, ge=0)
    is_active: bool = True


class RaftingInstructorUpdate(BaseSchema):
    full_name: str | None = None
    phone: str | None = None
    passport_details: str | None = None
    notes: str | None = None
    payout_per_trip: float | None = Field(default=None, ge=0)
    payout_per_guest: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class RaftingInstructorResponse(UUIDSchema):
    full_name: str
    phone: str | None
    passport_details: str | None = None
    notes: str | None
    payout_per_trip: float
    payout_per_guest: float
    is_active: bool
    created_at: datetime


class TransportVehicleCreate(BaseSchema):
    brand: str = Field(..., min_length=1, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    plate_number: str | None = Field(default=None, max_length=30)
    seats: int | None = Field(default=None, ge=1, le=200)
    organization: str | None = Field(default=None, max_length=255)
    trip_cost: float | None = Field(default=None, ge=0)
    driver_details: str | None = None
    notes: str | None = None
    is_active: bool = True


class TransportVehicleUpdate(BaseSchema):
    brand: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    plate_number: str | None = Field(default=None, max_length=30)
    seats: int | None = Field(default=None, ge=1, le=200)
    organization: str | None = Field(default=None, max_length=255)
    trip_cost: float | None = Field(default=None, ge=0)
    driver_details: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class TransportVehicleResponse(UUIDSchema):
    brand: str
    model: str | None
    plate_number: str | None
    seats: int | None
    organization: str | None
    trip_cost: float | None
    driver_details: str | None
    notes: str | None
    is_active: bool
    created_at: datetime

    @computed_field
    @property
    def name(self) -> str:
        parts = [self.brand, self.model or ""]
        return " ".join(p for p in parts if p).strip() or self.brand


class RaftingTripCreate(BaseSchema):
    deal_id: UUID | None = None
    route_id: UUID
    instructor_id: UUID | None = None
    vehicle_id: UUID | None = None
    trip_date: date
    trip_start_time: time | None = None
    trip_price: float | None = Field(default=None, ge=0)
    guests_count: int = Field(default=1, ge=1, le=500)
    status: str = BookingStatus.PENDING
    notes: str | None = None


class RaftingTripUpdate(BaseSchema):
    deal_id: UUID | None = None
    route_id: UUID | None = None
    instructor_id: UUID | None = None
    vehicle_id: UUID | None = None
    trip_date: date | None = None
    trip_start_time: time | None = None
    trip_price: float | None = Field(default=None, ge=0)
    guests_count: int | None = Field(default=None, ge=1, le=500)
    status: str | None = None
    notes: str | None = None


class RaftingTripResponse(UUIDSchema):
    deal_id: UUID | None
    route_id: UUID
    instructor_id: UUID | None
    vehicle_id: UUID | None
    trip_date: date
    trip_start_time: time | None = None
    trip_price: float | None = None
    guests_count: int
    status: str
    instructor_fee: float | None = None
    instructor_paid: bool = False
    instructor_paid_at: datetime | None = None
    notes: str | None
    created_at: datetime

    @computed_field
    @property
    def price_per_person(self) -> float | None:
        if self.trip_price is None:
            return None
        gc = self.guests_count
        if gc is None or gc < 1:
            return None
        return round(float(self.trip_price) / gc, 2)


class RaftingTripUsageSlot(BaseSchema):
    """Одно мероприятие (сплав), использующее транспорт или инструктора."""

    trip_id: UUID
    trip_date: date
    trip_start_time: time | None = None
    duration_hours: int | None = None
    route_id: UUID
    route_name: str
    guests_count: int
    status: str
    deal_id: UUID | None = None
    vehicle_summary: str | None = None


class TransportUsageGroup(BaseSchema):
    vehicle: TransportVehicleResponse
    events: list[RaftingTripUsageSlot]


class InstructorUsageGroup(BaseSchema):
    instructor: RaftingInstructorResponse
    events: list[RaftingTripUsageSlot]

