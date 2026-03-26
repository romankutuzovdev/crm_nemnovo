from datetime import datetime
from typing import Any

from app.modules.notifications.models import NotificationTemplate
from app.shared.base_schema import BaseSchema
from app.shared.enums import NotificationChannel


class NotificationTemplateCreate(BaseSchema):
    code: str
    channel: NotificationChannel
    subject: str | None = None
    body_template: str


class NotificationTemplateResponse(BaseSchema):
    id: int
    code: str
    channel: str
    subject: str | None
    body_template: str
    created_at: datetime

    @classmethod
    def from_model(cls, tpl: NotificationTemplate) -> "NotificationTemplateResponse":
        return cls(
            id=tpl.id,
            code=tpl.code,
            channel=tpl.channel,
            subject=tpl.subject,
            body_template=tpl.body_template,
            created_at=tpl.created_at,
        )


class SmsSendRequest(BaseSchema):
    phone: str
    template_code: str
    context: dict[str, Any] = {}

