from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bookings.models import Booking
from app.modules.deals.models import Deal
from app.modules.leads.models import Lead
from app.modules.payments.models import Payment
from app.modules.assets.models import Asset, AssetCategory
from app.modules.clients.models import Client
from app.modules.excursions.models import Excursion
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
    DailyFinancePoint,
    TopClientPoint,
    TopServiceProfitPoint,
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

    def _day_bucket(self, dt_col):
        # Postgres returns proper DATE for date_trunc + cast.
        # SQLite uses date(...) text; explicit CAST(Date) may produce unstable driver conversions.
        dialect = getattr(getattr(self.session, "bind", None), "dialect", None)
        name = getattr(dialect, "name", "")
        if name == "sqlite":
            return func.date(dt_col)
        return cast(dt_col, Date)

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
        month_excursion = self._month_bucket(Excursion.excursion_date).label("month")
        month_raft = self._month_bucket(RaftingTrip.trip_date).label("month")

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

        excursion_expenses_sql = (
            select(
                month_excursion,
                func.coalesce(func.sum(Excursion.expense_total), 0).label("expenses_known"),
            )
            .select_from(Excursion)
            .where(
                Excursion.excursion_date >= start,
                Excursion.excursion_date <= end,
            )
            .group_by(month_excursion)
            .order_by(month_excursion.asc())
        )
        excursion_expenses_rows = (await self.session.execute(excursion_expenses_sql)).all()
        excursion_expenses_by_month: dict[date, float] = {}
        for r in excursion_expenses_rows:
            m = normalize_month(r[0])
            if m is None:
                continue
            excursion_expenses_by_month[m] = float(r[1])

        rafting_fees_sql = (
            select(
                month_raft,
                func.coalesce(func.sum(RaftingTrip.instructor_fee), 0).label("expenses_known"),
            )
            .select_from(RaftingTrip)
            .where(
                RaftingTrip.trip_date >= start,
                RaftingTrip.trip_date <= end,
                RaftingTrip.status != BookingStatus.CANCELLED.value,
                RaftingTrip.instructor_fee.isnot(None),
            )
            .group_by(month_raft)
            .order_by(month_raft.asc())
        )
        rafting_fees_rows = (await self.session.execute(rafting_fees_sql)).all()
        rafting_fees_by_month: dict[date, float] = {}
        for r in rafting_fees_rows:
            m = normalize_month(r[0])
            if m is None:
                continue
            rafting_fees_by_month[m] = float(r[1])

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
                    "expenses_known": excursion_expenses_by_month.get(cursor, 0.0)
                    + rafting_fees_by_month.get(cursor, 0.0),
                    "profit_estimated": revenue_by_month.get(cursor, 0.0)
                    - (excursion_expenses_by_month.get(cursor, 0.0) + rafting_fees_by_month.get(cursor, 0.0)),
                }
            )
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)

        total_bookings = sum(int(p["bookings_count"]) for p in monthly)
        total_revenue_confirmed = float(sum(float(p["revenue_confirmed"]) for p in monthly))
        total_expenses_known = float(sum(float(p["expenses_known"]) for p in monthly))
        total_profit_estimated = float(total_revenue_confirmed - total_expenses_known)

        payments_count_sql = (
            select(func.count(Payment.id))
            .where(
                Payment.status == PaymentTxStatus.CONFIRMED.value,
                Payment.paid_at.isnot(None),
                Payment.paid_at >= start_dt,
                Payment.paid_at <= end_dt,
            )
        )
        payments_count_confirmed = int((await self.session.execute(payments_count_sql)).scalar_one() or 0)
        avg_check_confirmed = (
            float(total_revenue_confirmed / payments_count_confirmed) if payments_count_confirmed > 0 else 0.0
        )

        debt_sql = select(func.coalesce(func.sum(Deal.total_amount - Deal.paid_amount), 0)).where(
            Deal.status != DealStatus.CANCELLED.value
        )
        outstanding_debt_snapshot = float((await self.session.execute(debt_sql)).scalar_one() or 0)

        day_payment = self._day_bucket(Payment.paid_at).label("day")
        daily_inflow_rows = (
            await self.session.execute(
                select(
                    day_payment,
                    func.coalesce(func.sum(Payment.amount), 0).label("inflow_confirmed"),
                )
                .where(
                    Payment.status == PaymentTxStatus.CONFIRMED.value,
                    Payment.paid_at.isnot(None),
                    Payment.paid_at >= start_dt,
                    Payment.paid_at <= end_dt,
                )
                .group_by(day_payment)
                .order_by(day_payment.asc())
            )
        ).all()
        def normalize_day(v) -> date | None:
            if v is None:
                return None
            if isinstance(v, date) and not isinstance(v, datetime):
                return v
            if isinstance(v, str):
                return date.fromisoformat(v)
            if isinstance(v, datetime):
                return v.date()
            return None

        inflow_by_day: dict[date, float] = {}
        for r in daily_inflow_rows:
            d = normalize_day(r[0])
            if d is None:
                continue
            inflow_by_day[d] = float(r[1])

        daily_exc_exp_rows = (
            await self.session.execute(
                select(
                    Excursion.excursion_date,
                    func.coalesce(func.sum(Excursion.expense_total), 0),
                )
                .where(
                    Excursion.excursion_date >= start,
                    Excursion.excursion_date <= end,
                )
                .group_by(Excursion.excursion_date)
            )
        ).all()
        expenses_by_day = {r[0]: float(r[1]) for r in daily_exc_exp_rows if r[0] is not None}

        daily_raft_rows = (
            await self.session.execute(
                select(
                    RaftingTrip.trip_date,
                    func.coalesce(func.sum(RaftingTrip.instructor_fee), 0),
                )
                .where(
                    RaftingTrip.trip_date >= start,
                    RaftingTrip.trip_date <= end,
                    RaftingTrip.status != BookingStatus.CANCELLED.value,
                    RaftingTrip.instructor_fee.isnot(None),
                )
                .group_by(RaftingTrip.trip_date)
            )
        ).all()
        for d, amount in daily_raft_rows:
            if d is None:
                continue
            expenses_by_day[d] = float(expenses_by_day.get(d, 0.0) + float(amount or 0.0))

        daily: list[DailyFinancePoint] = []
        cursor_day = start
        while cursor_day <= end:
            inflow = float(inflow_by_day.get(cursor_day, 0.0))
            expenses = float(expenses_by_day.get(cursor_day, 0.0))
            daily.append(
                DailyFinancePoint(
                    day=cursor_day,
                    inflow_confirmed=round(inflow, 2),
                    expenses_known=round(expenses, 2),
                    profit_estimated=round(inflow - expenses, 2),
                )
            )
            cursor_day = cursor_day.fromordinal(cursor_day.toordinal() + 1)

        top_clients_rows = (
            await self.session.execute(
                select(
                    Client.id,
                    Client.first_name,
                    Client.last_name,
                    func.coalesce(func.sum(Payment.amount), 0).label("revenue_confirmed"),
                )
                .select_from(Payment)
                .join(Deal, Deal.id == Payment.deal_id)
                .join(Client, Client.id == Deal.client_id)
                .where(
                    Payment.status == PaymentTxStatus.CONFIRMED.value,
                    Payment.paid_at.isnot(None),
                    Payment.paid_at >= start_dt,
                    Payment.paid_at <= end_dt,
                )
                .group_by(Client.id, Client.first_name, Client.last_name)
                .order_by(func.coalesce(func.sum(Payment.amount), 0).desc())
            )
        ).all()
        top_clients = [
            TopClientPoint(
                client_id=str(r[0]),
                client_name=f"{r[1]} {r[2]}".strip(),
                revenue_confirmed=float(r[3] or 0),
            )
            for r in top_clients_rows
        ]

        service_revenue_rows = (
            await self.session.execute(
                select(
                    Deal.service_type,
                    func.coalesce(func.sum(Payment.amount), 0).label("revenue_confirmed"),
                )
                .select_from(Payment)
                .join(Deal, Deal.id == Payment.deal_id)
                .where(
                    Payment.status == PaymentTxStatus.CONFIRMED.value,
                    Payment.paid_at.isnot(None),
                    Payment.paid_at >= start_dt,
                    Payment.paid_at <= end_dt,
                )
                .group_by(Deal.service_type)
            )
        ).all()
        service_rev_map = {str(r[0]): float(r[1] or 0) for r in service_revenue_rows}

        top_services: list[TopServiceProfitPoint] = []
        for service_type, revenue in service_rev_map.items():
            expenses = 0.0
            if service_type == "rafting":
                expenses = float(sum(rafting_fees_by_month.values()))
            elif service_type == "combined":
                expenses = float(sum(rafting_fees_by_month.values()) + sum(excursion_expenses_by_month.values()))
            elif service_type == "hostel":
                expenses = float(sum(excursion_expenses_by_month.values()) * 0.2)
            elif service_type == "rent":
                expenses = 0.0
            else:
                expenses = float(sum(excursion_expenses_by_month.values()))
            top_services.append(
                TopServiceProfitPoint(
                    service_type=service_type,
                    revenue_confirmed=round(revenue, 2),
                    expenses_known=round(expenses, 2),
                    profit_estimated=round(revenue - expenses, 2),
                )
            )
        top_services.sort(key=lambda x: x.revenue_confirmed, reverse=True)

        return ReportsAnalyticsResponse(
            period_start=start,
            period_end=end,
            total_bookings=total_bookings,
            total_revenue_confirmed=total_revenue_confirmed,
            total_expenses_known=round(total_expenses_known, 2),
            total_profit_estimated=round(total_profit_estimated, 2),
            avg_check_confirmed=round(avg_check_confirmed, 2),
            payments_count_confirmed=payments_count_confirmed,
            outstanding_debt_snapshot=round(outstanding_debt_snapshot, 2),
            monthly=monthly,
            daily=daily,
            top_clients=top_clients,
            top_services=top_services[:10],
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
