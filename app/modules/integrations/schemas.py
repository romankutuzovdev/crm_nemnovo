from datetime import datetime
from typing import Any

from app.shared.base_schema import BaseSchema, UUIDSchema


class WebhookLogResponse(UUIDSchema):
    source: str
    is_processed: bool
    error: str | None
    ip_address: str
    created_at: datetime


class IntegrationConfigUpsert(BaseSchema):
    name: str
    is_enabled: bool = True
    config: dict[str, Any] | None = None


class IntegrationConfigResponse(BaseSchema):
    id: int
    name: str
    is_enabled: bool
    config: dict[str, Any] | None
    updated_at: datetime

