"""Персистентные UI-настройки организации (одна строка)."""

from sqlalchemy import JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UiSetting(Base):
    """Singleton: id всегда 1."""

    __tablename__ = "ui_setting"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    calendar_colors: Mapped[dict | None] = mapped_column(JSON, nullable=True)
