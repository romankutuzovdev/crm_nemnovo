from datetime import date, datetime
from uuid import UUID

from pydantic import EmailStr, field_validator, model_validator

from app.shared.base_schema import BaseSchema
from app.shared.enums import ServiceType
from app.shared.utils import normalize_phone


class CalendarQuickCreate(BaseSchema):
    """Быстрое создание сделки/бронирования из календаря."""
    client_id: UUID
    asset_id: UUID
    service_type: str = "rafting"
    start_datetime: datetime
    end_datetime: datetime
    guests_count: int = 1
    notes: str | None = None
    contract_id: UUID | None = None
    contract_text: str | None = None


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
    # Если есть заказ (deal): сводка по оплате для карточки в календаре
    payment_status: str | None = None
    total_amount: float | None = None
    paid_amount: float | None = None
    debt_amount: float | None = None
    contract_number: str | None = None
    contract_company_name: str | None = None
    contract_text: str | None = None


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


class CalendarNewClientInline(BaseSchema):
    """Данные для создания карточки клиента из формы мероприятия."""

    first_name: str
    last_name: str
    phone: str
    email: EmailStr | None = None

    @field_validator("phone")
    @classmethod
    def normalize_phone_field(cls, v: str) -> str:
        return normalize_phone(v)


class CalendarEventParticipantLine(BaseSchema):
    """Один участник мероприятия: клиент (существующий или новый) и его услуга."""

    client_id: UUID | None = None
    new_client: CalendarNewClientInline | None = None
    service: CalendarMultiServiceLine

    @model_validator(mode="after")
    def exactly_one_client_source(self) -> "CalendarEventParticipantLine":
        has_existing = self.client_id is not None
        has_new = self.new_client is not None
        if has_existing == has_new:
            raise ValueError("Укажите либо client_id, либо new_client для каждого участника")
        return self


class CalendarEventMultiCreate(BaseSchema):
    """Создание карточки мероприятия: участники с услугами и слоты."""

    guests_count: int = 1
    notes: str | None = None
    contract_id: UUID | None = None
    contract_text: str | None = None
    participants: list[CalendarEventParticipantLine]
    slots: list[CalendarMultiSlotLine]
