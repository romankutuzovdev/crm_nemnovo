from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bookings.models import Booking
from app.modules.deals.models import Deal
from app.modules.leads.models import Lead
from app.modules.payments.models import Payment
from app.modules.assets.models import Asset, AssetCategory
from app.modules.rafting.models import RaftingInstructor, RaftingTrip
from app.modules.reports.schemas import (
    BookingsByAssetRow,
    BookingsReportResponse,
    InstructorPayoutRow,
    InstructorPayoutsResponse,
    LeadsBreakdownPoint,
    LeadsReportResponse,
    MethodBreakdown,
    ReportSummaryResponse,
    ReportsAnalyticsResponse,
    ServiceBreakdown,
)
from app.shared.enums import BookingStatus, DealStatus, PaymentTxStatus


class ReportsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _month_bucket(self, dt_col):
        # Postgres: date_trunc('month', ts) -> timestamp; cast to date.
        # SQLite: strftime('%Y-%m-01', ts) -> string (оставляем строкой, чтобы избежать
        # нестабильной обработки CAST(... AS DATE) драйвером/SQLAlchemy).
        dialect = getattr(getattr(self.session, "bind", None), "dialect", None)
        name = getattr(dialect, "name", "")
        if name == "sqlite":
            return func.strftime("%Y-%m-01", dt_col)
        return cast(func.date_trunc("month", dt_col), Date)

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

    async def get_analytics(self, start: date, end: date) -> ReportsAnalyticsResponse:
        start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

        month_booking = self._month_bucket(Booking.created_at).label("month")
        month_payment = self._month_bucket(Payment.paid_at).label("month")

        def normalize_month(v) -> date | None:
            if v is None:
                return None
            if isinstance(v, date) and not isinstance(v, datetime):
                return v
            if isinstance(v, str):
                # ожидаем 'YYYY-MM-01'
                return date.fromisoformat(v)
            # Fallback: иногда драйвер может вернуть datetime
            if isinstance(v, datetime):
                return date(v.year, v.month, 1)
            return None

        bookings_sql = (
            select(
                month_booking,
                func.count(Booking.id).label("bookings_count"),
            )
            .select_from(Booking)
            .where(
                Booking.created_at >= start_dt,
                Booking.created_at <= end_dt,
                Booking.status != BookingStatus.CANCELLED.value,
            )
            .group_by(month_booking)
            .order_by(month_booking.asc())
        )
        bookings_rows = (await self.session.execute(bookings_sql)).all()
        bookings_by_month: dict[date, int] = {}
        for r in bookings_rows:
            m = normalize_month(r[0])
            if m is None:
                continue
            bookings_by_month[m] = int(r[1])

        revenue_sql = (
            select(
                month_payment,
                func.coalesce(func.sum(Payment.amount), 0).label("revenue_confirmed"),
            )
            .select_from(Payment)
            .where(
                Payment.status == PaymentTxStatus.CONFIRMED.value,
                Payment.paid_at.isnot(None),
                Payment.paid_at >= start_dt,
                Payment.paid_at <= end_dt,
            )
            .group_by(month_payment)
            .order_by(month_payment.asc())
        )
        revenue_rows = (await self.session.execute(revenue_sql)).all()
        revenue_by_month: dict[date, float] = {}
        for r in revenue_rows:
            m = normalize_month(r[0])
            if m is None:
                continue
            revenue_by_month[m] = float(r[1])

        def first_of_month(d: date) -> date:
            return date(d.year, d.month, 1)

        monthly = []
        cursor = first_of_month(start)
        last = first_of_month(end)
        while cursor <= last:
            monthly.append(
                {
                    "month": cursor,
                    "bookings_count": bookings_by_month.get(cursor, 0),
                    "revenue_confirmed": revenue_by_month.get(cursor, 0.0),
                }
            )
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)

        total_bookings = sum(int(p["bookings_count"]) for p in monthly)
        total_revenue_confirmed = float(sum(float(p["revenue_confirmed"]) for p in monthly))

        return ReportsAnalyticsResponse(
            period_start=start,
            period_end=end,
            total_bookings=total_bookings,
            total_revenue_confirmed=total_revenue_confirmed,
            monthly=monthly,
        )

    async def get_leads_report(self, start: date, end: date) -> LeadsReportResponse:
        start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

        total_sql = select(func.count(Lead.id)).where(
            Lead.created_at >= start_dt,
            Lead.created_at <= end_dt,
        )
        total = int((await self.session.execute(total_sql)).scalar_one() or 0)

        by_status_sql = (
            select(Lead.status, func.count(Lead.id))
            .where(Lead.created_at >= start_dt, Lead.created_at <= end_dt)
            .group_by(Lead.status)
            .order_by(func.count(Lead.id).desc())
        )
        rows = (await self.session.execute(by_status_sql)).all()
        by_status = [LeadsBreakdownPoint(status=str(r[0]), count=int(r[1])) for r in rows]

        return LeadsReportResponse(
            period_start=start,
            period_end=end,
            total_leads_created=total,
            by_status=by_status,
        )

    async def get_bookings_report(self, start: date, end: date) -> BookingsReportResponse:
        start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

        # Считаем бронирования, которые пересекаются с периодом по времени брони.
        base = (
            select(
                Asset.id,
                Asset.code,
                Asset.name,
                AssetCategory.name.label("category_name"),
                func.count(Booking.id).label("bookings_count"),
            )
            .select_from(Booking)
            .join(Asset, Booking.asset_id == Asset.id)
            .join(AssetCategory, Asset.category_id == AssetCategory.id)
            .where(
                Booking.status != BookingStatus.CANCELLED.value,
                Booking.start_datetime < end_dt,
                Booking.end_datetime > start_dt,
            )
            .group_by(Asset.id, Asset.code, Asset.name, AssetCategory.name)
            .order_by(func.count(Booking.id).desc(), Asset.code.asc())
        )
        rows = (await self.session.execute(base)).all()
        by_asset = [
            BookingsByAssetRow(
                asset_id=str(r[0]),
                asset_code=str(r[1]),
                asset_name=str(r[2]),
                category_name=str(r[3]),
                bookings_count=int(r[4]),
            )
            for r in rows
        ]
        total = sum(int(r.bookings_count) for r in by_asset)
        return BookingsReportResponse(
            period_start=start,
            period_end=end,
            total_bookings=total,
            by_asset=by_asset,
        )

    async def get_instructor_payouts(self, start: date, end: date) -> InstructorPayoutsResponse:
        start_d = start
        end_d = end
        sql = (
            select(
                RaftingInstructor.id,
                RaftingInstructor.full_name,
                func.count(RaftingTrip.id).label("trips_count"),
                func.coalesce(func.sum(RaftingTrip.instructor_fee), 0).label("total_due"),
            )
            .select_from(RaftingTrip)
            .join(RaftingInstructor, RaftingTrip.instructor_id == RaftingInstructor.id)
            .where(
                RaftingTrip.instructor_id.isnot(None),
                RaftingTrip.instructor_fee.isnot(None),
                RaftingTrip.instructor_paid.is_(False),
                RaftingTrip.status == BookingStatus.CONFIRMED.value,
                RaftingTrip.trip_date >= start_d,
                RaftingTrip.trip_date <= end_d,
            )
            .group_by(RaftingInstructor.id, RaftingInstructor.full_name)
            .order_by(func.coalesce(func.sum(RaftingTrip.instructor_fee), 0).desc())
        )
        rows = (await self.session.execute(sql)).all()
        out_rows = [
            InstructorPayoutRow(
                instructor_id=str(r[0]),
                instructor_name=str(r[1]),
                trips_count=int(r[2]),
                total_due=float(r[3]),
            )
            for r in rows
        ]
        total_due = float(sum(r.total_due for r in out_rows))
        return InstructorPayoutsResponse(
            period_start=start,
            period_end=end,
            total_due=total_due,
            rows=out_rows,
        )
