from datetime import datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema


class TelephonyCallRow(BaseSchema):
    lead_id: UUID
    created_at: datetime
    status: str
    call_id: str | None
    client_id: UUID | None
    client_name: str | None
    client_phone: str | None
    comment: str | None
    recording_url: str | None
    converted_deal_id: UUID | None


class TelephonyWebhookEventRow(BaseSchema):
    webhook_id: UUID
    created_at: datetime
    source: str
    is_processed: bool
    error: str | None
    caller_phone: str | None
    call_id: str | None
    recording_url: str | None
    raw_payload: dict | None


class MtsVatsHistoryResponse(BaseSchema):
    ok: bool
    message: str
    tried: list[str] = []
    status_code: int | None = None
    sample: dict | list | str | None = None
    last_attempt: str | None = None


class MtsVatsImportResponse(BaseSchema):
    ok: bool
    message: str
    imported: int = 0
    skipped: int = 0
    total_seen: int = 0
    source_path: str | None = None
