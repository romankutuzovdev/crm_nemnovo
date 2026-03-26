from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import BookingStatus


class RaftingRouteCreate(BaseSchema):
    name: str
    difficulty: str | None = None
    duration_hours: int | None = None
    description: str | None = None
    is_active: bool = True


class RaftingRouteUpdate(BaseSchema):
    name: str | None = None
    difficulty: str | None = None
    duration_hours: int | None = None
    description: str | None = None
    is_active: bool | None = None


class RaftingRouteResponse(UUIDSchema):
    name: str
    difficulty: str | None
    duration_hours: int | None
    description: str | None
    is_active: bool
    created_at: datetime


class RaftingInstructorCreate(BaseSchema):
    full_name: str
    phone: str | None = None
    notes: str | None = None
    is_active: bool = True


class RaftingInstructorUpdate(BaseSchema):
    full_name: str | None = None
    phone: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class RaftingInstructorResponse(UUIDSchema):
    full_name: str
    phone: str | None
    notes: str | None
    is_active: bool
    created_at: datetime


class TransportVehicleCreate(BaseSchema):
    name: str
    plate_number: str | None = None
    seats: int | None = None
    notes: str | None = None
    is_active: bool = True


class TransportVehicleUpdate(BaseSchema):
    name: str | None = None
    plate_number: str | None = None
    seats: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class TransportVehicleResponse(UUIDSchema):
    name: str
    plate_number: str | None
    seats: int | None
    notes: str | None
    is_active: bool
    created_at: datetime


class RaftingTripCreate(BaseSchema):
    deal_id: UUID | None = None
    route_id: UUID
    instructor_id: UUID | None = None
    vehicle_id: UUID | None = None
    trip_date: date
    guests_count: int = Field(default=1, ge=1, le=500)
    status: str = BookingStatus.PENDING
    notes: str | None = None


class RaftingTripUpdate(BaseSchema):
    deal_id: UUID | None = None
    route_id: UUID | None = None
    instructor_id: UUID | None = None
    vehicle_id: UUID | None = None
    trip_date: date | None = None
    guests_count: int | None = Field(default=None, ge=1, le=500)
    status: str | None = None
    notes: str | None = None


class RaftingTripResponse(UUIDSchema):
    deal_id: UUID | None
    route_id: UUID
    instructor_id: UUID | None
    vehicle_id: UUID | None
    trip_date: date
    guests_count: int
    status: str
    notes: str | None
    created_at: datetime

