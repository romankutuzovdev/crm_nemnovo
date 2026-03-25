from pydantic import EmailStr

from app.shared.base_schema import BaseSchema
from app.modules.users.schemas import UserResponse


class LoginRequest(BaseSchema):
    email: EmailStr
    password: str


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshRequest(BaseSchema):
    refresh_token: str


class AccessTokenResponse(BaseSchema):
    access_token: str
    token_type: str = "bearer"
