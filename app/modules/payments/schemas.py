from datetime import datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import PaymentMethod, PaymentTxStatus


class PaymentCreate(BaseSchema):
    deal_id: UUID
    amount: float
    method: PaymentMethod
    notes: str | None = None


class PaymentResponse(UUIDSchema):
    deal_id: UUID
    amount: float
    method: str
    status: str
    external_id: str | None
    paid_at: datetime | None
    confirmed_by: UUID | None
    notes: str | None
    created_at: datetime


class PaymentConfirm(BaseSchema):
    payment_id: UUID


class OnlinePaymentInitRequest(BaseSchema):
    deal_id: UUID
    amount: float
    return_url: str


class OnlinePaymentInitResponse(BaseSchema):
    payment_id: UUID
    payment_url: str
    external_id: str


class YookassaWebhookPayload(BaseSchema):
    event: str
    object: dict
