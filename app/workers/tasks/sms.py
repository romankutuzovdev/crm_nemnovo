import httpx
import structlog
from celery import Task

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = structlog.get_logger()

SMS_API_URL = "https://sms.ru/sms/send"


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, name="app.workers.tasks.sms.send_sms_task")
def send_sms_task(self: Task, log_id: str, phone: str, template_code: str, context: dict) -> dict:
    """Send SMS and update notification log status."""
    from jinja2 import Template
    import asyncio

    # Template registry (in production — load from DB or file)
    TEMPLATES = {
        "new_lead_notification": "Новая заявка в CRM от клиента. ID: {{ lead_id }}",
        "booking_confirmed": "Ваше бронирование подтверждено на {{ date }}. CRM",
        "payment_received": "Получена оплата {{ amount }} руб. по заказу {{ deal_number }}.",
        "deal_reminder": "Напоминание: заказ {{ deal_number }} начинается {{ date }}.",
    }

    template_str = TEMPLATES.get(template_code)
    if template_str is None:
        # Allow custom templates stored in DB
        async def _fetch_template() -> str | None:
            from sqlalchemy import select
            from app.db.session import AsyncSessionLocal
            from app.modules.notifications.models import NotificationTemplate

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(NotificationTemplate).where(NotificationTemplate.code == template_code)
                )
                tpl = result.scalar_one_or_none()
                return tpl.body_template if tpl else None

        try:
            template_str = asyncio.get_event_loop().run_until_complete(_fetch_template())
        except RuntimeError:
            template_str = asyncio.run(_fetch_template())

    if template_str is None:
        template_str = "{{ message }}"
    text = Template(template_str).render(**context)

    try:
        response = httpx.post(
            SMS_API_URL,
            params={
                "api_id": settings.SMS_API_KEY,
                "to": phone,
                "msg": text,
                "from": settings.SMS_SENDER,
                "json": 1,
            },
            timeout=10.0,
        )
        data = response.json()

        if data.get("status") == "OK":
            _update_log(log_id, status="sent")
            logger.info("sms.sent", phone=phone[:5] + "***", template=template_code)
            return {"status": "sent"}
        else:
            raise Exception(f"SMS API error: {data}")

    except Exception as exc:
        logger.error("sms.failed", phone=phone[:5] + "***", error=str(exc))
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            _update_log(log_id, status="failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}


def _update_log(log_id: str, status: str, error: str = "") -> None:
    """Sync DB update for notification log (called from Celery worker)."""
    import asyncio
    from uuid import UUID
    from datetime import datetime, timezone
    from sqlalchemy import update
    from app.db.session import AsyncSessionLocal
    from app.modules.notifications.models import NotificationLog

    async def _update():
        async with AsyncSessionLocal() as session:
            values = {"status": status}
            if status == "sent":
                values["sent_at"] = datetime.now(timezone.utc)
            if error:
                values["error"] = error
            await session.execute(
                update(NotificationLog).where(NotificationLog.id == UUID(log_id)).values(**values)
            )
            await session.commit()

    asyncio.get_event_loop().run_until_complete(_update())


@celery_app.task(name="app.workers.tasks.sms.notify_new_lead")
def notify_new_lead(lead_id: str) -> None:
    """Triggered when a new lead arrives. Notify all active managers."""
    import asyncio
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.modules.users.models import User

    async def _notify():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.is_active == True, User.phone.isnot(None))
            )
            managers = result.scalars().all()
            for manager in managers:
                send_sms_task.delay(
                    "system",
                    manager.phone,
                    "new_lead_notification",
                    {"lead_id": lead_id},
                )

    asyncio.get_event_loop().run_until_complete(_notify())
