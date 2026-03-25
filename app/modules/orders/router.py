from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.bookings.schemas import BookingCreate, BookingResponse, BookingUpdate
from app.modules.bookings.service import BookingService
from app.modules.orders.schemas import OrderCreate, OrderResponse, OrderUpdate
from app.modules.orders.service import OrderService
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/", response_model=PaginatedResponse[OrderResponse])
async def list_orders(
    client_id: UUID | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = OrderService(db)
    if client_id:
        items = await service.repo.list_by_client(client_id, offset=offset, limit=limit)
        total = await service.repo.count(filters={"client_id": client_id})
    elif current_user.role.name == "manager":
        items = await service.repo.list_by_manager(current_user.id, offset=offset, limit=limit)
        total = await service.repo.count(filters={"assigned_to": current_user.id})
    else:
        items = await service.repo.list(offset=offset, limit=limit)
        total = await service.repo.count()
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/by-number/{number}", response_model=OrderResponse)
async def get_order_by_number(
    number: str,
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Поиск заказа по человекочитаемому номеру (например 2025-0042)."""
    service = OrderService(db)
    return await service.get_order_by_number(number)


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = OrderService(db)
    return await service.get_order(order_id)


@router.post("/", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = OrderService(db)
    return await service.create_order(data, created_by=current_user.id)


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: UUID,
    data: OrderUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = OrderService(db)
    return await service.update_order(order_id, data, updated_by=current_user.id)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: UUID,
    current_user=require_permission("orders", "delete"),
    db: AsyncSession = Depends(get_db),
):
    service = OrderService(db)
    return await service.cancel_order(order_id, cancelled_by=current_user.id)


# Bookings inside order
@router.get("/{order_id}/bookings", response_model=list[BookingResponse])
async def list_order_bookings(
    order_id: UUID,
    current_user=require_permission("bookings", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = BookingService(db)
    return await service.repo.list_by_deal(order_id)


@router.post("/{order_id}/bookings", response_model=BookingResponse, status_code=201)
async def add_order_booking(
    order_id: UUID,
    data: BookingCreate,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = BookingService(db)
    return await service.create_for_order(order_id, data, created_by=current_user.id)


@router.patch("/{order_id}/bookings/{booking_id}", response_model=BookingResponse)
async def update_order_booking(
    order_id: UUID,
    booking_id: UUID,
    data: BookingUpdate,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = BookingService(db)
    return await service.update_for_order(order_id, booking_id, data, updated_by=current_user.id)


@router.post("/{order_id}/bookings/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_order_booking(
    order_id: UUID,
    booking_id: UUID,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = BookingService(db)
    return await service.cancel_for_order(order_id, booking_id, cancelled_by=current_user.id)

