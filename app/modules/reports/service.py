from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.deals.models import Deal
from app.modules.payments.models import Payment
from app.modules.reports.schemas import (
    MethodBreakdown,
    ReportSummaryResponse,
    ServiceBreakdown,
)
from app.shared.enums import DealStatus, PaymentTxStatus


class ReportsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_summary(
        self,
        start: date,
        end: date,
        manager_id: UUID | None = None,
    ) -> ReportSummaryResponse:
        start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

        # --- Выручка за период (подтверждённые платежи по дате paid_at)
        rev_base = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Deal, Payment.deal_id == Deal.id)
            .where(
                Payment.status == PaymentTxStatus.CONFIRMED.value,
                Payment.paid_at.isnot(None),
                Payment.paid_at >= start_dt,
                Payment.paid_at <= end_dt,
            )
        )
        if manager_id:
            rev_base = rev_base.where(Deal.assigned_to == manager_id)
        revenue = float((await self.session.execute(rev_base)).scalar_one() or 0)

        # --- Задолженность (снимок)
        debt_base = select(func.coalesce(func.sum(Deal.total_amount - Deal.paid_amount), 0)).where(
            Deal.status != DealStatus.CANCELLED.value
        )
        if manager_id:
            debt_base = debt_base.where(Deal.assigned_to == manager_id)
        debt = float((await self.session.execute(debt_base)).scalar_one() or 0)

        # --- По способам оплаты
        by_method_sql = (
            select(Payment.method, func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Deal, Payment.deal_id == Deal.id)
            .where(
                Payment.status == PaymentTxStatus.CONFIRMED.value,
                Payment.paid_at.isnot(None),
                Payment.paid_at >= start_dt,
                Payment.paid_at <= end_dt,
            )
            .group_by(Payment.method)
        )
        if manager_id:
            by_method_sql = by_method_sql.where(Deal.assigned_to == manager_id)
        method_rows = (await self.session.execute(by_method_sql)).all()
        by_method = [MethodBreakdown(method=str(r[0]), amount=float(r[1])) for r in method_rows]

        # --- По типу услуги заказа
        by_svc_sql = (
            select(Deal.service_type, func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Deal, Payment.deal_id == Deal.id)
            .where(
                Payment.status == PaymentTxStatus.CONFIRMED.value,
                Payment.paid_at.isnot(None),
                Payment.paid_at >= start_dt,
                Payment.paid_at <= end_dt,
            )
            .group_by(Deal.service_type)
        )
        if manager_id:
            by_svc_sql = by_svc_sql.where(Deal.assigned_to == manager_id)
        svc_rows = (await self.session.execute(by_svc_sql)).all()
        by_service = [ServiceBreakdown(service_type=str(r[0]), amount=float(r[1])) for r in svc_rows]

        return ReportSummaryResponse(
            period_start=start,
            period_end=end,
            revenue_in_period=revenue,
            outstanding_debt=max(0.0, debt),
            by_method=by_method,
            by_service=by_service,
        )
