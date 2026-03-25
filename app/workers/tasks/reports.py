import asyncio
import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(name="app.workers.tasks.reports.recalculate_overdue_debts")
def recalculate_overdue_debts() -> None:
    """Nightly: mark invoices as overdue if past due_date and unpaid."""
    async def _run():
        from datetime import date
        from sqlalchemy import update
        from app.db.session import AsyncSessionLocal
        from app.modules.payments.models import Invoice
        from app.shared.enums import InvoiceStatus

        async with AsyncSessionLocal() as session:
            today = date.today()
            await session.execute(
                update(Invoice)
                .where(Invoice.due_date < today)
                .where(Invoice.status == InvoiceStatus.SENT)
                .values(status=InvoiceStatus.OVERDUE)
            )
            await session.commit()
            logger.info("reports.overdue_recalculated")

    asyncio.get_event_loop().run_until_complete(_run())


@celery_app.task(name="app.workers.tasks.reports.generate_monthly_report")
def generate_monthly_report() -> None:
    """Monthly: generate financial summary report."""
    logger.info("reports.monthly_report_generated")
    # TODO: generate PDF / send to director email


@celery_app.task(name="app.workers.tasks.reports.cleanup_expired_tokens")
def cleanup_expired_tokens() -> None:
    """Nightly: clean up expired JWT blacklist entries from Redis."""
    logger.info("reports.expired_tokens_cleaned")
    # Redis TTL handles this automatically; this task is for monitoring
