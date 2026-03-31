from pydantic import BaseModel, Field


class CalendarColorsResponse(BaseModel):
    """Цвета типов мероприятий в календаре (hex)."""

    colors: dict[str, str] = Field(
        ...,
        description="Ключи: rafting, hostel, rent, combined, lead",
    )


class CalendarColorsPatch(BaseModel):
    """Частичное обновление: переданные ключи перезаписывают сохранённые."""

    colors: dict[str, str]
