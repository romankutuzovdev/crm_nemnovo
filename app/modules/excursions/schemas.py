from datetime import date, datetime, time
from uuid import UUID

from pydantic import Field, computed_field, field_validator, model_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import ExcursionStatus, PaymentStatus


class ExcursionGuideCreate(BaseSchema):
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    passport_details: str | None = None
    notes: str | None = None
    is_active: bool = True


class ExcursionGuideUpdate(BaseSchema):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    passport_details: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class ExcursionGuideResponse(UUIDSchema):
    full_name: str
    phone: str | None
    passport_details: str | None
    notes: str | None
    is_active: bool
    created_at: datetime


class ExcursionProgramObjectCreate(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    asset_id: UUID | None = None
    capacity: int | None = Field(default=None, ge=1, le=10000)
    unit_price: float = Field(default=0, ge=0)
    sort_order: int = 0


class ExcursionProgramObjectAdd(BaseSchema):
    """Добавление объекта к уже существующему пункту программы."""

    name: str = Field(..., min_length=1, max_length=255)
    asset_id: UUID | None = None
    capacity: int | None = Field(default=None, ge=1, le=10000)
    unit_price: float = Field(default=0, ge=0)
    sort_order: int = 0


class ExcursionProgramObjectResponse(UUIDSchema):
    step_id: UUID
    asset_id: UUID | None
    sort_order: int
    name: str
    capacity: int | None
    unit_price: float


class ExcursionProgramStepCreate(BaseSchema):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    sort_order: int = 0
    objects: list[ExcursionProgramObjectCreate] = Field(default_factory=list)


class ExcursionProgramStepUpdate(BaseSchema):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    sort_order: int | None = None


class ExcursionProgramStepResponse(UUIDSchema):
    excursion_id: UUID
    sort_order: int
    start_time: time | None
    end_time: time | None
    title: str
    description: str | None
    objects: list[ExcursionProgramObjectResponse]


class ExcursionClientLinkCreate(BaseSchema):
    client_id: UUID
    guests_count: int = Field(default=1, ge=1, le=500)
    notes: str | None = None
    client_notified: bool = False


class ExcursionClientLinkUpdate(BaseSchema):
    """Частичное обновление связи клиент ↔ экскурсия (оповещение, гости, заметка)."""

    client_notified: bool | None = None
    guests_count: int | None = Field(default=None, ge=1, le=500)
    notes: str | None = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if self.client_notified is None and self.guests_count is None and self.notes is None:
            raise ValueError("Укажите хотя бы одно поле для обновления")
        return self


class ExcursionClientBrief(BaseSchema):
    id: UUID
    first_name: str
    last_name: str
    phone: str


class ExcursionClientLinkResponse(UUIDSchema):
    excursion_id: UUID
    client_id: UUID
    guests_count: int
    notes: str | None
    client_notified: bool
    client: ExcursionClientBrief


class PayerCompanyBrief(BaseSchema):
    """Организация из справочника — плательщик по мероприятию."""

    id: UUID
    name: str
    inn: str | None


class ExcursionCreate(BaseSchema):
    title: str = Field(..., min_length=1, max_length=255)
    excursion_date: date
    status: str = ExcursionStatus.DRAFT
    payment_status: str = PaymentStatus.UNPAID
    guide_id: UUID | None = None
    vehicle_id: UUID | None = None
    deal_id: UUID | None = None
    payer_company_id: UUID | None = None
    income_total: float = Field(default=0, ge=0)
    expense_total: float = Field(default=0, ge=0)
    transport_income: float | None = Field(default=None, ge=0)
    transport_expense: float | None = Field(default=None, ge=0)
    guide_fee: float | None = Field(default=None, ge=0)
    notes: str | None = None
    program_steps: list[ExcursionProgramStepCreate] = Field(default_factory=list)

    @field_validator("payment_status")
    @classmethod
    def _payment_status_create(cls, v: str) -> str:
        allowed = {x.value for x in PaymentStatus}
        if v not in allowed:
            raise ValueError("Недопустимый статус оплаты")
        return v


class ExcursionUpdate(BaseSchema):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    excursion_date: date | None = None
    status: str | None = None
    payment_status: str | None = None
    guide_id: UUID | None = None
    vehicle_id: UUID | None = None
    deal_id: UUID | None = None
    payer_company_id: UUID | None = None
    income_total: float | None = Field(default=None, ge=0)
    expense_total: float | None = Field(default=None, ge=0)
    transport_income: float | None = None
    transport_expense: float | None = None
    guide_fee: float | None = None
    notes: str | None = None

    @field_validator("payment_status")
    @classmethod
    def _payment_status_update(cls, v: str | None) -> str | None:
        if v is None:
            return None
        allowed = {x.value for x in PaymentStatus}
        if v not in allowed:
            raise ValueError("Недопустимый статус оплаты")
        return v


class TransportVehicleBrief(BaseSchema):
    id: UUID
    name: str
    plate_number: str | None


class ExcursionListItem(UUIDSchema):
    title: str
    excursion_date: date
    status: str
    payment_status: str
    guide_id: UUID | None
    vehicle_id: UUID | None
    deal_id: UUID | None
    payer_company_id: UUID | None = None
    payer_company_name: str | None = None
    income_total: float
    expense_total: float
    transport_income: float | None
    transport_expense: float | None
    guide_fee: float | None
    created_at: datetime


class ExcursionDetailResponse(ExcursionListItem):
    notes: str | None
    guide: ExcursionGuideResponse | None
    vehicle: TransportVehicleBrief | None
    payer_company: PayerCompanyBrief | None = None
    program_steps: list[ExcursionProgramStepResponse]
    client_links: list[ExcursionClientLinkResponse]

    @computed_field
    @property
    def program_objects_cost_sum(self) -> float:
        total = 0.0
        for s in self.program_steps:
            for o in s.objects:
                total += float(o.unit_price or 0)
        return round(total, 2)

    @computed_field
    @property
    def balance_hint(self) -> float:
        """Ориентир: доходы минус расходы и стоимость объектов программы (unit_price)."""
        ti = float(self.income_total or 0)
        te = float(self.expense_total or 0)
        tr_in = float(self.transport_income or 0)
        tr_ex = float(self.transport_expense or 0)
        gf = float(self.guide_fee or 0)
        obj_cost = self.program_objects_cost_sum
        return round(ti + tr_in - te - tr_ex - gf - obj_cost, 2)
