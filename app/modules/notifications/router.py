from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.notifications.models import NotificationLog
from app.shared.base_repository import BaseRepository
from app.modules.notifications.models import NotificationTemplate
from app.modules.notifications.schemas import NotificationTemplateCreate, NotificationTemplateResponse, SmsSendRequest
from app.modules.notifications.service import NotificationService
from app.core.exceptions import ConflictError

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/logs", response_model=list[dict])
async def list_notification_logs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("notifications", "read"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    result = await db.execute(
        select(NotificationLog)
        .order_by(NotificationLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "channel": log.channel,
            "template_code": log.template_code,
            "status": log.status,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "error": log.error,
        }
        for log in logs
    ]


@router.get("/templates", response_model=list[NotificationTemplateResponse])
async def list_notification_templates(
    channel: str | None = Query(None),
    current_user=require_permission("notifications", "read"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    stmt = select(NotificationTemplate).order_by(NotificationTemplate.created_at.desc())
    if channel:
        stmt = stmt.where(NotificationTemplate.channel == channel)
    result = await db.execute(stmt)
    templates = result.scalars().all()
    return [NotificationTemplateResponse.from_model(t) for t in templates]


@router.post("/templates", response_model=NotificationTemplateResponse)
async def create_notification_template(
    data: NotificationTemplateCreate,
    current_user=require_permission("notifications", "write"),
    db: AsyncSession = Depends(get_db),
):
    tpl = NotificationTemplate(**data.model_dump())
    db.add(tpl)
    try:
        await db.flush()
    except Exception as e:
        # Usually unique constraint for code
        raise ConflictError(str(e))
    await db.refresh(tpl)
    return NotificationTemplateResponse.from_model(tpl)


@router.post("/sms/send")
async def send_sms(
    data: SmsSendRequest,
    current_user=require_permission("notifications", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = NotificationService(db)
    log_id = await service.send_sms(
        phone=data.phone,
        template_code=data.template_code,
        context=data.context,
    )
    return {"status": "queued", "log_id": str(log_id)}
