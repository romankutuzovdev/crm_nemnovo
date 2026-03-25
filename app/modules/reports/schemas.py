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
