from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.ui_settings.repository import UiSettingsRepository
from app.modules.ui_settings.schemas import CalendarColorsPatch, CalendarColorsResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/calendar-colors", response_model=CalendarColorsResponse)
async def get_calendar_colors(
    current_user=require_permission("bookings", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Цвета для отображения мероприятий в календаре (чтение — у кого есть доступ к бронированиям)."""
    repo = UiSettingsRepository(db)
    colors = await repo.get_calendar_colors()
    return CalendarColorsResponse(colors=colors)


@router.patch("/calendar-colors", response_model=CalendarColorsResponse)
async def patch_calendar_colors(
    data: CalendarColorsPatch,
    current_user=require_permission("settings", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Задать цвета типов услуг (админ; директор — при наличии write для settings)."""
    repo = UiSettingsRepository(db)
    colors = await repo.patch_calendar_colors(data.colors)
    return CalendarColorsResponse(colors=colors)
