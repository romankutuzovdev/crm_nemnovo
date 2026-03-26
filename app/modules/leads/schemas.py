from datetime import date, datetime
from uuid import UUID

from pydantic import field_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import LeadSource, LeadStatus, ServiceType
from app.shared.utils import normalize_phone


class LeadFromSiteCreate(BaseSchema):
    """Payload from site webhook."""
    first_name: str
    last_name: str = ""
    phone: str
    email: str | None = None
    service_type: ServiceType | None = None
    preferred_date: date | None = None
    guests_count: int = 1
    comment: str | None = None
    page_url: str | None = None

    @field_validator("phone")
    @classmethod
    def normalize(cls, v: str) -> str:
        return normalize_phone(v)


class LeadCreate(BaseSchema):
    client_id: UUID | None = None
    source: LeadSource = LeadSource.MANUAL
    service_type: ServiceType | None = None
    preferred_date: date | None = None
    guests_count: int = 1
    comment: str | None = None
    assigned_to: UUID | None = None


class LeadUpdate(BaseSchema):
    status: LeadStatus | None = None
    assigned_to: UUID | None = None
    service_type: ServiceType | None = None
    preferred_date: date | None = None
    guests_count: int | None = None
    comment: str | None = None


class LeadAttachClient(BaseSchema):
    client_id: UUID


class AssignableUserResponse(BaseSchema):
    id: UUID
    full_name: str


class LeadResponse(UUIDSchema):
    client_id: UUID | None
    source: str
    status: str
    service_type: str | None
    preferred_date: date | None
    guests_count: int
    comment: str | None
    assigned_to: UUID | None
    converted_deal_id: UUID | None
    created_at: datetime
    updated_at: datetime


class LeadAuditEntryResponse(UUIDSchema):
    action: str
    user_name: str
    created_at: datetime
    details: str
