from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.modules.users.models import User
from app.modules.users.repository import RoleRepository, UserRepository
from app.modules.users.schemas import UserCreate, UserUpdate
from app.shared.enums import AuditAction

logger = structlog.get_logger()


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)

    async def create_user(self, data: UserCreate, created_by: UUID) -> User:
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ConflictError(f"User with email {data.email} already exists")

        role = await self.role_repo.get(data.role_id)
        if not role:
            raise NotFoundError(f"Role {data.role_id} not found")

        async with self.session.begin():
            user = await self.user_repo.create(
                email=data.email,
                phone=data.phone,
                full_name=data.full_name,
                hashed_password=hash_password(data.password),
                role_id=data.role_id,
            )
            await write_audit_log(
                self.session,
                user_id=created_by,
                action=AuditAction.CREATE,
                resource="users",
                resource_id=user.id,
                after={"email": user.email, "role_id": user.role_id},
            )

        logger.info("user.created", user_id=str(user.id), email=user.email)
        return user

    async def update_user(self, user_id: UUID, data: UserUpdate, updated_by: UUID) -> User:
        user = await self.user_repo.get_or_raise(user_id)
        before = {"email": user.email, "is_active": user.is_active, "role_id": user.role_id}

        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            return user

        async with self.session.begin():
            user = await self.user_repo.update(user_id, **update_data)
            await write_audit_log(
                self.session,
                user_id=updated_by,
                action=AuditAction.UPDATE,
                resource="users",
                resource_id=user_id,
                before=before,
                after=update_data,
            )

        return user

    async def get_user(self, user_id: UUID) -> User:
        user = await self.user_repo.get_with_role(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        return user

    async def list_users(self, offset: int = 0, limit: int = 50) -> list[User]:
        return await self.user_repo.list_active(offset=offset, limit=limit)

    async def deactivate_user(self, user_id: UUID, deactivated_by: UUID) -> None:
        async with self.session.begin():
            await self.user_repo.update(user_id, is_active=False)
            await write_audit_log(
                self.session,
                user_id=deactivated_by,
                action=AuditAction.UPDATE,
                resource="users",
                resource_id=user_id,
                after={"is_active": False},
            )
