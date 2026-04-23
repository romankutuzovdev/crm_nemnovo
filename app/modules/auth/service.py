from datetime import datetime, timezone

import redis.exceptions
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.modules.auth.schemas import AccessTokenResponse, TokenResponse
from app.modules.users.repository import UserRepository

logger = structlog.get_logger()


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)

    async def login(self, email: str, password: str) -> TokenResponse:
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")
        if not user.is_active:
            raise UnauthorizedError("Account is deactivated")

        # Update last_login (session already in transaction from get_db)
        await self.user_repo.update(user.id, last_login=datetime.now(timezone.utc))

        access_token = create_access_token(user.id, user.role.name)
        refresh_token = create_refresh_token(user.id)

        logger.info("auth.login", user_id=str(user.id))

        from app.modules.users.schemas import UserResponse
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse.model_validate(user),
        )

    async def refresh(self, refresh_token: str) -> AccessTokenResponse:
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")

        user_id = payload.get("sub")
        user = await self.user_repo.get_with_role(user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or deactivated")

        access_token = create_access_token(user.id, user.role.name)
        return AccessTokenResponse(access_token=access_token)

    async def logout(self, token: str, redis_client) -> None:
        try:
            payload = decode_token(token)
            jti = payload.get("jti", token[-16:])
            exp = payload.get("exp", 0)
            ttl = max(0, int(exp - datetime.now(timezone.utc).timestamp()))
            try:
                await redis_client.setex(f"token:blacklist:{jti}", ttl, "1")
            except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as e:
                logger.warning(
                    "redis.unavailable_logout_no_blacklist",
                    error=str(e),
                )
        except ValueError:
            pass  # Token already invalid — nothing to blacklist
        logger.info("auth.logout")
