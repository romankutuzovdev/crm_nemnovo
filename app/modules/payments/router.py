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
    OrderClientFinanceRow,
    PaymentAllocationsUpdate,
    PaymentAllocationResponse,
    PaymentCreate,
    PaymentResponse,
)
from app.modules.payments.service import PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])


def to_payment_response(payment) -> PaymentResponse:
    return PaymentResponse(
        id=payment.id,
        deal_id=payment.deal_id,
        amount=float(payment.amount),
        method=payment.method,
        status=payment.status,
        external_id=payment.external_id,
        paid_at=payment.paid_at,
        confirmed_by=payment.confirmed_by,
        notes=payment.notes,
        created_at=payment.created_at,
        allocations=[
            PaymentAllocationResponse(
                id=a.id,
                payment_id=a.payment_id,
                client_id=a.client_id,
                client_name=(
                    f"{a.client.first_name} {a.client.last_name}".strip() if getattr(a, "client", None) else None
                ),
                amount=float(a.amount),
                comment=a.comment,
                created_at=a.created_at,
            )
            for a in (payment.allocations or [])
        ],
    )


@router.get("/deal/{deal_id}", response_model=list[PaymentResponse])
async def list_payments(
    deal_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    rows = await service.list_by_deal(deal_id)
    return [to_payment_response(p) for p in rows]


@router.get("/order/{order_id}", response_model=list[PaymentResponse])
async def list_payments_by_order(
    order_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Alias для ТЗ: order_id вместо deal_id."""
    service = PaymentService(db)
    rows = await service.list_by_deal(order_id)
    return [to_payment_response(p) for p in rows]


@router.get("/client/{client_id}", response_model=list[PaymentResponse])
async def list_payments_by_client(
    client_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    rows = await service.list_by_client(client_id)
    return [to_payment_response(p) for p in rows]


@router.post("/", response_model=PaymentResponse, status_code=201)
async def create_payment(
    data: PaymentCreate,
    current_user=require_permission("payments", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    payment = await service.create_payment(data, confirmed_by=current_user.id)
    return to_payment_response(payment)


@router.put("/{payment_id}/allocations", response_model=PaymentResponse)
async def set_payment_allocations(
    payment_id: UUID,
    data: PaymentAllocationsUpdate,
    current_user=require_permission("payments", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    payment = await service.set_allocations(payment_id, data.allocations, updated_by=current_user.id)
    return to_payment_response(payment)


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


@router.get("/order/{order_id}/clients-finance", response_model=list[OrderClientFinanceRow])
async def order_clients_finance(
    order_id: UUID,
    current_user=require_permission("payments", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = PaymentService(db)
    return await service.order_client_finance(order_id)


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
