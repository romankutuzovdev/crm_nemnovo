import asyncio
import os
import sys

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
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


@router.post("/demo-seed")
async def run_demo_seed(
    current_user=require_permission("settings", "write"),
):
    """
    Fill database with demo/randomized data from existing seed scripts.
    Runs base seed first (roles/admin/categories), then demo data seed.
    """
    cmds = [
        [sys.executable, "scripts/seed.py"],
        [sys.executable, "scripts/seed_demo_data.py"],
    ]
    logs: list[str] = []
    for cmd in cmds:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        out_b, err_b = await proc.communicate()
        out = out_b.decode("utf-8", errors="ignore").strip()
        err = err_b.decode("utf-8", errors="ignore").strip()
        if out:
            logs.append(out)
        if err:
            logs.append(err)
        if proc.returncode != 0:
            raise ValidationError(
                f"Seed command failed ({' '.join(cmd)}), exit={proc.returncode}\n{err or out}"
            )
    return {"ok": True, "message": "Demo seed completed", "log": "\n\n".join(logs)[-8000:]}
