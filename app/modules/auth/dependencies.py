from redis.exceptions import ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError
import structlog
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token
from app.db.redis import get_redis
from app.db.session import get_db
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

security = HTTPBearer()
logger = structlog.get_logger()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis),
) -> User:
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except ValueError:
        raise UnauthorizedError("Invalid or expired token")

    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")

    # Check blacklist (в production Redis обязателен)
    jti = payload.get("jti", token[-16:])
    try:
        blacklisted = await redis_client.exists(f"token:blacklist:{jti}")
    except (RedisConnectionError, RedisTimeoutError) as e:
        # Fail-open для auth-проверки: если Redis временно недоступен, не роняем API целиком.
        # Это лучше, чем массовые 500 на защищённых эндпоинтах.
        logger.warning(
            "redis.unavailable_skip_blacklist",
            error=str(e),
            hint="Проверьте REDIS_URL и доступность Redis",
        )
        blacklisted = False
    if blacklisted:
        raise UnauthorizedError("Token has been revoked")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid token payload")

    repo = UserRepository(db)
    user = await repo.get_with_role(user_id)

    if not user:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise UnauthorizedError("User is deactivated")

    return user
