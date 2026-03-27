from datetime import date

from pydantic import Field

from app.shared.base_schema import BaseSchema


class MethodBreakdown(BaseSchema):
    method: str
    amount: float


class ServiceBreakdown(BaseSchema):
    service_type: str
    amount: float


class ReportSummaryResponse(BaseSchema):
    period_start: date
    period_end: date
    revenue_in_period: float = Field(
        description="Подтверждённые платежи с paid_at в периоде [start, end]"
    )
    outstanding_debt: float = Field(
        description="Задолженность по неотменённым заказам (снимок)"
    )
    by_method: list[MethodBreakdown]
    by_service: list[ServiceBreakdown]


class MonthlyKpiPoint(BaseSchema):
    month: date = Field(description="Первый день месяца (UTC)")
    bookings_count: int = Field(description="Количество бронирований (не отменённых) за месяц")
    revenue_confirmed: float = Field(
        description="Сумма подтверждённых платежей (по paid_at) за месяц"
    )


class ReportsAnalyticsResponse(BaseSchema):
    period_start: date
    period_end: date
    total_bookings: int
    total_revenue_confirmed: float
    monthly: list[MonthlyKpiPoint]


class LeadsBreakdownPoint(BaseSchema):
    status: str
    count: int


class LeadsReportResponse(BaseSchema):
    period_start: date
    period_end: date
    total_leads_created: int
    by_status: list[LeadsBreakdownPoint]


class BookingsByAssetRow(BaseSchema):
    asset_id: str
    asset_code: str
    asset_name: str
    category_name: str
    bookings_count: int


class BookingsReportResponse(BaseSchema):
    period_start: date
    period_end: date
    total_bookings: int
    by_asset: list[BookingsByAssetRow]


class InstructorPayoutRow(BaseSchema):
    instructor_id: str
    instructor_name: str
    trips_count: int
    total_due: float


class InstructorPayoutsResponse(BaseSchema):
    period_start: date
    period_end: date
    total_due: float
    rows: list[InstructorPayoutRow]
