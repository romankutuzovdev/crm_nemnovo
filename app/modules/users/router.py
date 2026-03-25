from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.users.schemas import UserCreate, UserResponse, UserUpdate
from app.modules.users.service import UserService
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=PaginatedResponse[UserResponse])
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("users", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    users = await service.list_users(offset=offset, limit=limit)
    total = await service.user_repo.count()
    return PaginatedResponse(items=users, total=total, offset=offset, limit=limit)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user=require_permission("users", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    return await service.get_user(user_id)


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    current_user=require_permission("users", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    return await service.create_user(data, created_by=current_user.id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    current_user=require_permission("users", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    return await service.update_user(user_id, data, updated_by=current_user.id)


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: UUID,
    current_user=require_permission("users", "delete"),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    await service.deactivate_user(user_id, deactivated_by=current_user.id)
