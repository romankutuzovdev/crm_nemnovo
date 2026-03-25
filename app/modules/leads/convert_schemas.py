from datetime import date
from uuid import UUID

from app.shared.base_schema import BaseSchema
from app.shared.enums import ServiceType


class LeadConvertToOrderRequest(BaseSchema):
    """Конвертация заявки в заказ (по ТЗ заявка всегда ведёт к заказу)."""

    # Опционально можно поменять/зафиксировать параметры заказа при конвертации
    client_id: UUID | None = None
    assigned_to: UUID | None = None
    service_type: ServiceType | None = None
    start_date: date | None = None
    end_date: date | None = None
    guests_count: int | None = None
    total_amount: float = 0.0
    notes: str | None = None

