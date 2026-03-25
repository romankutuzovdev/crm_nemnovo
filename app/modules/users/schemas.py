from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, field_validator

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import UserRole


class RoleSchema(BaseSchema):
    id: int
    name: str


class UserCreate(BaseSchema):
    email: EmailStr
    phone: str | None = None
    full_name: str
    password: str
    role_id: int

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseSchema):
    email: EmailStr | None = None
    phone: str | None = None
    full_name: str | None = None
    role_id: int | None = None
    is_active: bool | None = None


class UserResponse(UUIDSchema):
    email: str
    phone: str | None
    full_name: str
    is_active: bool
    role: RoleSchema
    last_login: datetime | None
    created_at: datetime


class UserShortResponse(UUIDSchema):
    full_name: str
    email: str
    role: RoleSchema
