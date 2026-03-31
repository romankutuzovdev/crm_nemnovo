from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.shared.base_schema import BaseSchema, UUIDSchema


class ContractCreate(BaseSchema):
    company_id: UUID
    number: str = Field(..., min_length=1, max_length=100)
    title: str | None = Field(None, max_length=500)
    notes: str | None = None


class ContractResponse(UUIDSchema):
    company_id: UUID
    company_name: str
    number: str
    title: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
