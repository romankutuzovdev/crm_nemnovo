import structlog
from jinja2 import Template
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import NotificationLog, NotificationTemplate
from app.shared.enums import NotificationChannel, NotificationStatus

logger = structlog.get_logger()


class NotificationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def send_sms(
        self,
        phone: str,
        template_code: str,
        context: dict,
    ):
        """Enqueue SMS via Celery task."""
        from app.workers.tasks.sms import send_sms_task

        log = NotificationLog(
            recipient_phone=phone,
            channel=NotificationChannel.SMS,
            template_code=template_code,
            payload=context,
            status=NotificationStatus.QUEUED,
        )
        self.session.add(log)
        await self.session.flush()

        send_sms_task.delay(str(log.id), phone, template_code, context)
        logger.info("notification.queued", channel="sms", phone=phone[:7] + "***")
        return log.id

    async def notify_managers_new_lead(self, lead_id: str) -> None:
        """Notify all active managers about a new lead."""
        from sqlalchemy import select
        from app.modules.users.models import User
        from app.shared.enums import UserRole

        result = await self.session.execute(
            select(User).join(User.role).where(
                User.is_active == True,
                User.phone.isnot(None),
            )
        )
        managers = result.scalars().all()

        for manager in managers:
            await self.send_sms(
                phone=manager.phone,
                template_code="new_lead_notification",
                context={"lead_id": lead_id, "manager_name": manager.full_name},
            )
