from datetime import date, datetime
from uuid import UUID

from app.modules.deals.schemas import (  # Совместимость: данные хранятся в deals
    BookingInDealCreate as BookingInOrderCreate,
    DealCreate as OrderCreate,
    DealItemCreate as OrderItemCreate,
    DealItemResponse as OrderItemResponse,
    DealResponse as OrderResponse,
    DealUpdate as OrderUpdate,
)

# Публичные имена (TЗ: "Заказ")
__all__ = [
    "BookingInOrderCreate",
    "OrderCreate",
    "OrderItemCreate",
    "OrderItemResponse",
    "OrderResponse",
    "OrderUpdate",
    "UUID",
    "date",
    "datetime",
]

