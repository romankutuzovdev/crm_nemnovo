from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, field_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import CompanySegment
from app.shared.utils import normalize_phone


class CompanyCreate(BaseSchema):
    name: str
    inn: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    segment: CompanySegment = CompanySegment.B2B


class CompanyResponse(UUIDSchema):
    name: str
    inn: str | None
    address: str | None
    phone: str | None
    email: str | None
    segment: str
    created_at: datetime
    updated_at: datetime


class CompanyUpdate(BaseSchema):
    name: str | None = None
    inn: str | None = None
    address: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    segment: CompanySegment | None = None


class CompanyClientBrief(UUIDSchema):
    first_name: str
    last_name: str
    phone: str
    email: str | None


class CompanyDetailResponse(CompanyResponse):
    clients: list[CompanyClientBrief]


class ClientCreate(BaseSchema):
    first_name: str
    last_name: str
    email: EmailStr | None = None
    phone: str
    company_id: UUID | None = None
    source: str = "manual"
    tags: list[str] = []
    assigned_to: UUID | None = None

    @field_validator("phone")
    @classmethod
    def normalize(cls, v: str) -> str:
        return normalize_phone(v)


class ClientUpdate(BaseSchema):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    company_id: UUID | None = None
    tags: list[str] | None = None
    assigned_to: UUID | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize(cls, v: str | None) -> str | None:
        return normalize_phone(v) if v else None


class ClientResponse(UUIDSchema):
    first_name: str
    last_name: str
    email: str | None
    phone: str
    source: str
    tags: list[str] | None
    company: CompanyResponse | None
    created_at: datetime
    updated_at: datetime


class ClientNoteCreate(BaseSchema):
    text: str


class ClientNoteResponse(UUIDSchema):
    client_id: UUID
    author_id: UUID
    text: str
    created_at: datetime


class ClientAuditEntryResponse(UUIDSchema):
    action: str
    user_name: str
    created_at: datetime
    details: str


class ClientCallEntryResponse(UUIDSchema):
    """Событие звонка: заявка с источником telephony (webhook АТС)."""

    created_at: datetime
    status: str
    source_ref: str | None
    comment: str | None
    recording_url: str | None
    converted_deal_id: UUID | None
