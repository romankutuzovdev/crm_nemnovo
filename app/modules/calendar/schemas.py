from datetime import date, datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema
from app.shared.enums import ServiceType


class CalendarQuickCreate(BaseSchema):
    """Быстрое создание сделки/бронирования из календаря."""
    client_id: UUID
    asset_id: UUID
    service_type: str = "rafting"
    start_datetime: datetime
    end_datetime: datetime
    guests_count: int = 1
    notes: str | None = None


class CalendarEventResponse(BaseSchema):
    """Событие для календаря (совместимо с FullCalendar)."""
    id: str  # "booking:{uuid}" или "lead:{uuid}"
    title: str
    start: datetime
    end: datetime
    all_day: bool = False
    # Тип: booking | lead
    event_type: str
    booking_id: UUID | None = None
    deal_id: UUID | None = None
    lead_id: UUID | None = None
    asset_id: UUID | None = None
    asset_name: str | None = None
    client_id: UUID | None = None
    client_name: str | None = None
    service_type: str = ""
    status: str = ""
    assigned_to: UUID | None = None
    service_types: list[str] = []
    color: str | None = None  # для цветового разделения по типу


class CalendarMultiServiceLine(BaseSchema):
    service_type: ServiceType
    description: str
    quantity: int = 1
    unit_price: float = 0


class CalendarMultiSlotLine(BaseSchema):
    asset_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    quantity: int = 1


class CalendarEventMultiCreate(BaseSchema):
    """Создание карточки мероприятия с несколькими услугами и слотами."""

    client_id: UUID
    guests_count: int = 1
    notes: str | None = None
    services: list[CalendarMultiServiceLine]
    slots: list[CalendarMultiSlotLine]
