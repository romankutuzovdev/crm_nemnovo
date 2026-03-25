from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


async def write_audit_log(
    session: AsyncSession,
    user_id: UUID,
    action: str,
    resource: str,
    resource_id: UUID,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip_address: str = "",
) -> None:
    from app.modules.users.models import AuditLog

    log = AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        before=before,
        after=after,
        ip_address=ip_address,
    )
    session.add(log)

    logger.info(
        "audit.event",
        user_id=str(user_id),
        action=action,
        resource=resource,
        resource_id=str(resource_id),
    )
