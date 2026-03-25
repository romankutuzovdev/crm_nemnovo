from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, field_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.utils import normalize_phone


class CompanyCreate(BaseSchema):
    name: str
    inn: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None


class CompanyResponse(UUIDSchema):
    name: str
    inn: str | None
    address: str | None
    phone: str | None


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
