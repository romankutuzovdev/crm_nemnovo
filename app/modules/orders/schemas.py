from datetime import date, datetime
from uuid import UUID

from app.shared.base_schema import UUIDSchema
from app.modules.deals.schemas import (  # Совместимость: данные хранятся в deals
    BookingInDealCreate as BookingInOrderCreate,
    DealCreate as OrderCreate,
    DealItemCreate as OrderItemCreate,
    DealItemResponse as OrderItemResponse,
    DealResponse as OrderResponse,
    DealUpdate as OrderUpdate,
)


class OrderAuditEntryResponse(UUIDSchema):
    action: str
    user_name: str
    created_at: datetime
    details: str

# Публичные имена (TЗ: "Заказ")
__all__ = [
    "BookingInOrderCreate",
    "OrderCreate",
    "OrderItemCreate",
    "OrderItemResponse",
    "OrderResponse",
    "OrderAuditEntryResponse",
    "OrderUpdate",
    "UUID",
    "date",
    "datetime",
]

