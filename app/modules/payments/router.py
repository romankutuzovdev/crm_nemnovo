from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.core.permissions import require_permission
from app.core.security import verify_hmac_signature
from app.db.session import get_db
from app.modules.payments.schemas import (
    PaymentCreate,
    PaymentResponse,
    YookassaWebhookPayload,
)
from app.modules.payments.service import PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/deal/{deal_id}", response_model=list[PaymentResponse])
async def list_payments(
    deal_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.list_by_deal(deal_id)


@router.post("/", response_model=PaymentResponse, status_code=201)
async def create_payment(
    data: PaymentCreate,
    current_user=require_permission("payments", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.create_payment(data, confirmed_by=current_user.id)


@router.post("/{payment_id}/refund", response_model=PaymentResponse)
async def refund_payment(
    payment_id: UUID,
    current_user=require_permission("payments", "refund"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.refund_payment(payment_id, refunded_by=current_user.id)


@router.post("/webhook/yookassa", include_in_schema=False)
async def yookassa_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    signature = request.headers.get("X-Yookassa-Signature", "")

    if not verify_hmac_signature(body, signature, settings.YOOKASSA_WEBHOOK_SECRET):
        raise ForbiddenError("Invalid webhook signature")

    import json
    payload = json.loads(body)
    event = payload.get("event", "")

    if event == "payment.succeeded":
        external_id = payload["object"]["id"]
        service = PaymentService(db)
        await service.confirm_online_payment(external_id)

    return {"status": "ok"}
