from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.core.permissions import require_permission
from app.core.security import verify_hmac_signature
from app.db.session import get_db
from app.modules.integrations.models import IntegrationConfig, WebhookLog
from app.modules.integrations.schemas import (
    IntegrationConfigResponse,
    IntegrationConfigUpsert,
    WebhookLogResponse,
)
from app.modules.integrations.service import IntegrationService

router = APIRouter(prefix="/webhooks", tags=["integrations"])


@router.post("/site", include_in_schema=False)
async def site_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if settings.is_production and not (settings.SITE_WEBHOOK_SECRET or "").strip():
        raise ForbiddenError("Site webhook is not configured (set SITE_WEBHOOK_SECRET)")

    body = await request.body()
    signature = request.headers.get("X-Webhook-Signature", "")

    if settings.SITE_WEBHOOK_SECRET.strip():
        if not verify_hmac_signature(body, signature, settings.SITE_WEBHOOK_SECRET.strip()):
            raise ForbiddenError("Invalid webhook signature")

    import json
    payload = json.loads(body)
    ip = request.client.host if request.client else ""

    async with db.begin():
        service = IntegrationService(db)
        return await service.handle_site_lead(payload, ip_address=ip)


@router.post("/telephony", include_in_schema=False)
async def telephony_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    signature = request.headers.get("X-Telephony-Signature", "")

    if settings.TELEPHONY_WEBHOOK_SECRET and not verify_hmac_signature(
        body, signature, settings.TELEPHONY_WEBHOOK_SECRET
    ):
        raise ForbiddenError("Invalid webhook signature")

    import json
    payload = json.loads(body)
    ip = request.client.host if request.client else ""

    async with db.begin():
        service = IntegrationService(db)
        return await service.handle_telephony_event(payload, ip_address=ip)


@router.post("/mts-vats", include_in_schema=False)
async def mts_vats_webhook(
    request: Request,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for MTS Virtual PBX.
    Supports token auth via query (`?token=...`) or header `X-MTS-Token`.
    """
    expected_token = (settings.MTS_VATS_WEBHOOK_TOKEN or "").strip()
    provided_token = (token or request.headers.get("X-MTS-Token", "")).strip()

    if expected_token and provided_token != expected_token:
        raise ForbiddenError("Invalid MTS webhook token")

    body = await request.body()
    import json

    payload = json.loads(body)
    ip = request.client.host if request.client else ""

    async with db.begin():
        service = IntegrationService(db)
        return await service.handle_mts_vats_event(payload, ip_address=ip)


@router.get("/logs", response_model=list[WebhookLogResponse])
async def list_webhook_logs(
    source: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("integrations", "read"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    stmt = select(WebhookLog).order_by(WebhookLog.created_at.desc())
    if source:
        stmt = stmt.where(WebhookLog.source == source)
    result = await db.execute(stmt.offset(offset).limit(limit))
    logs = result.scalars().all()
    return [
        WebhookLogResponse(
            id=l.id,
            source=l.source,
            is_processed=l.is_processed,
            error=l.error,
            ip_address=l.ip_address,
            created_at=l.created_at,
        )
        for l in logs
    ]


@router.get("/configs", response_model=list[IntegrationConfigResponse])
async def list_integration_configs(
    current_user=require_permission("integrations", "read"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    result = await db.execute(select(IntegrationConfig).order_by(IntegrationConfig.name))
    rows = result.scalars().all()
    return [
        IntegrationConfigResponse(
            id=r.id,
            name=r.name,
            is_enabled=r.is_enabled,
            config=r.config,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.post("/configs", response_model=IntegrationConfigResponse)
async def upsert_integration_config(
    data: IntegrationConfigUpsert,
    current_user=require_permission("integrations", "write"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    result = await db.execute(select(IntegrationConfig).where(IntegrationConfig.name == data.name))
    row = result.scalar_one_or_none()
    if row is None:
        row = IntegrationConfig(name=data.name, is_enabled=data.is_enabled, config=data.config)
        db.add(row)
        await db.flush()
    else:
        row.is_enabled = data.is_enabled
        row.config = data.config
        await db.flush()
    await db.refresh(row)
    return IntegrationConfigResponse(
        id=row.id,
        name=row.name,
        is_enabled=row.is_enabled,
        config=row.config,
        updated_at=row.updated_at,
    )
