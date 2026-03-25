from datetime import datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import BookingStatus


class BookingCreate(BaseSchema):
    asset_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    quantity: int = 1


class BookingUpdate(BaseSchema):
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    quantity: int | None = None
    status: BookingStatus | None = None


class BookingResponse(UUIDSchema):
    deal_id: UUID
    asset_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    quantity: int
    status: str
    created_at: datetime

