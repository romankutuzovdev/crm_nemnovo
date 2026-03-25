from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.core.security import verify_hmac_signature
from app.db.session import get_db
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
