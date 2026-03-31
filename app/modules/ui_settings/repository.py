from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ui_settings.models import UiSetting

# Дефолты применяются, если в БД пусто или нет ключа (как в календаре до настроек).
DEFAULT_CALENDAR_COLORS: dict[str, str] = {
    "rafting": "#ef4444",
    "hostel": "#3b82f6",
    "rent": "#f59e0b",
    "combined": "#8b5cf6",
    "lead": "#ec4899",
}

SINGLETON_ID = 1


class UiSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _merged(self, raw: dict | None) -> dict[str, str]:
        out = {**DEFAULT_CALENDAR_COLORS}
        if isinstance(raw, dict):
            for k, v in raw.items():
                if isinstance(v, str) and v.strip():
                    out[str(k)] = v.strip()
        return out

    async def get_calendar_colors(self) -> dict[str, str]:
        result = await self.session.execute(select(UiSetting).where(UiSetting.id == SINGLETON_ID))
        row = result.scalar_one_or_none()
        return self._merged(row.calendar_colors if row else None)

    async def patch_calendar_colors(self, patch: dict[str, str]) -> dict[str, str]:
        result = await self.session.execute(select(UiSetting).where(UiSetting.id == SINGLETON_ID))
        row = result.scalar_one_or_none()
        current: dict[str, str] = {}
        if row and isinstance(row.calendar_colors, dict):
            current = {str(k): str(v) for k, v in row.calendar_colors.items() if v}
        current.update({k: v.strip() for k, v in patch.items() if v and v.strip()})
        merged_public = self._merged(current)

        if row is None:
            self.session.add(UiSetting(id=SINGLETON_ID, calendar_colors=current))
        else:
            row.calendar_colors = current

        await self.session.flush()
        return merged_public
