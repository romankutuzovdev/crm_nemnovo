from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.notifications.models import NotificationLog
from app.shared.base_repository import BaseRepository

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
