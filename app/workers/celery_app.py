from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "crm",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks.sms",
        "app.workers.tasks.email",
        "app.workers.tasks.reports",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone=settings.TZ,
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "recalculate-overdue-debts": {
            "task": "app.workers.tasks.reports.recalculate_overdue_debts",
            "schedule": crontab(hour=2, minute=0),  # Every night at 02:00
        },
        "generate-monthly-report": {
            "task": "app.workers.tasks.reports.generate_monthly_report",
            "schedule": crontab(day_of_month=1, hour=6, minute=0),  # 1st of each month
        },
        "cleanup-expired-tokens": {
            "task": "app.workers.tasks.reports.cleanup_expired_tokens",
            "schedule": crontab(hour=3, minute=0),
        },
    },
)
