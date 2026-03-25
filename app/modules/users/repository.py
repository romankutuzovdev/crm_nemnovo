from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.modules.users.models import Role, User

_ASSIGNABLE_LEAD_ROLE_NAMES = ("admin", "director", "manager")
from app.shared.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.role))
            .where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_with_role(self, user_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.role))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def list_active(self, offset: int = 0, limit: int = 50) -> list[User]:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.role))
            .where(User.is_active == True)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_assignable_for_leads(self, limit: int = 200) -> list[User]:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.role))
            .join(Role, User.role_id == Role.id)
            .where(User.is_active.is_(True), Role.name.in_(_ASSIGNABLE_LEAD_ROLE_NAMES))
            .order_by(User.full_name)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_active_by_role_name(self, role_name: str) -> list[User]:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.role))
            .join(Role, User.role_id == Role.id)
            .where(User.is_active.is_(True), Role.name == role_name)
            .order_by(User.full_name)
        )
        return list(result.scalars().all())


class RoleRepository(BaseRepository[Role]):
    model = Role

    async def get_by_name(self, name: str) -> Role | None:
        result = await self.session.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()
