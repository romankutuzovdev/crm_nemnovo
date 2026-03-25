import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(bind=True, max_retries=3, name="app.workers.tasks.email.send_email_task")
def send_email_task(self, to_email: str, subject: str, body: str) -> dict:
    """Send transactional email. Placeholder — replace with real SMTP/SendGrid."""
    try:
        # TODO: integrate with SMTP or SendGrid
        logger.info("email.sent", to=to_email, subject=subject)
        return {"status": "sent"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)
