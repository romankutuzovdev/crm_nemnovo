from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.reports.csv_export import render_report_summary_csv
from app.modules.reports.schemas import (
    BookingsReportResponse,
    InstructorPayoutsResponse,
    LeadsReportResponse,
    ReportSummaryResponse,
    ReportsAnalyticsResponse,
)
from app.modules.reports.service import ReportsService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummaryResponse)
async def report_summary(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports", "read"),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")

    manager_id = None
    if current_user.role.name == "manager":
        manager_id = current_user.id

    service = ReportsService(db)
    return await service.get_summary(start, end, manager_id=manager_id)


@router.get("/analytics", response_model=ReportsAnalyticsResponse)
async def reports_analytics(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports_analytics", "read"),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")

    service = ReportsService(db)
    return await service.get_analytics(start, end)


@router.get("/leads", response_model=LeadsReportResponse)
async def report_leads(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports", "read"),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")
    service = ReportsService(db)
    return await service.get_leads_report(start, end)


@router.get("/bookings", response_model=BookingsReportResponse)
async def report_bookings(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports", "read"),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")
    service = ReportsService(db)
    return await service.get_bookings_report(start, end)


@router.get("/rafting/instructor-payouts", response_model=InstructorPayoutsResponse)
async def report_instructor_payouts(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports", "read"),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")
    service = ReportsService(db)
    return await service.get_instructor_payouts(start, end)


@router.get("/summary/export.csv")
async def export_report_summary_csv(
    start: date = Query(..., description="Начало периода (включительно)"),
    end: date = Query(..., description="Конец периода (включительно)"),
    current_user=require_permission("reports", "export"),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт сводки в CSV (UTF-8 с BOM, разделитель `;`)."""
    if start > end:
        from app.core.exceptions import ValidationError

        raise ValidationError("start must be <= end")

    manager_id = None
    if current_user.role.name == "manager":
        manager_id = current_user.id

    service = ReportsService(db)
    summary = await service.get_summary(start, end, manager_id=manager_id)
    text = render_report_summary_csv(summary)
    filename = f"report_{start.isoformat()}_{end.isoformat()}.csv"
    return Response(
        content=text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
