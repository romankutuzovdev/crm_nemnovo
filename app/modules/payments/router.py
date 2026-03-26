from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.core.permissions import require_permission
from app.core.security import verify_hmac_signature
from app.db.session import get_db
from app.modules.payments.schemas import (
    InvoiceCreate,
    InvoiceResponse,
    OnlinePaymentInitRequest,
    OnlinePaymentInitResponse,
    PaymentCreate,
    PaymentResponse,
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


@router.get("/order/{order_id}", response_model=list[PaymentResponse])
async def list_payments_by_order(
    order_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Alias для ТЗ: order_id вместо deal_id."""
    service = PaymentService(db)
    return await service.list_by_deal(order_id)


@router.get("/client/{client_id}", response_model=list[PaymentResponse])
async def list_payments_by_client(
    client_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.list_by_client(client_id)


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


@router.get("/order/{order_id}/invoices", response_model=list[InvoiceResponse])
async def list_order_invoices(
    order_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    invoices = await service.list_invoices_by_deal(order_id)
    return [
        InvoiceResponse(
            id=i.id,
            deal_id=i.deal_id,
            issuer_company_id=i.issuer_company_id,
            issuer_company_name=i.issuer_company.name if i.issuer_company else None,
            amount=i.amount,
            due_date=i.due_date,
            status=i.status,
            pdf_url=i.pdf_url,
            created_at=i.created_at,
        )
        for i in invoices
    ]


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    current_user=require_permission("payments", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    i = await service.create_invoice(data, created_by=current_user.id)
    issuer_name = None
    if i.issuer_company_id:
        issuer = await service.company_repo.get_or_raise(i.issuer_company_id)
        issuer_name = issuer.name
    return InvoiceResponse(
        id=i.id,
        deal_id=i.deal_id,
        issuer_company_id=i.issuer_company_id,
        issuer_company_name=issuer_name,
        amount=i.amount,
        due_date=i.due_date,
        status=i.status,
        pdf_url=i.pdf_url,
        created_at=i.created_at,
    )


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


@router.post("/online/init", response_model=OnlinePaymentInitResponse)
async def init_online_payment(
    data: OnlinePaymentInitRequest,
    current_user=require_permission("payments", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.init_online_payment(data, created_by=current_user.id)
