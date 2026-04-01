from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.excursions.schemas import (
    ExcursionGuideUsageGroup,
    ExcursionClientLinkCreate,
    ExcursionClientLinkUpdate,
    ExcursionCreate,
    ExcursionDetailResponse,
    ExcursionGuideCreate,
    ExcursionGuideResponse,
    ExcursionGuideUpdate,
    ExcursionListItem,
    ExcursionProgramObjectAdd,
    ExcursionProgramStepCreate,
    ExcursionUpdate,
)
from app.modules.excursions.service import ExcursionService
from app.modules.rafting.usage import normalize_usage_range

router = APIRouter(prefix="/excursions", tags=["excursions"])


# --- Справочник экскурсоводов ---


@router.get("/guides", response_model=list[ExcursionGuideResponse])
async def list_guides(
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).list_guides()


@router.post("/guides", response_model=ExcursionGuideResponse, status_code=201)
async def create_guide(
    data: ExcursionGuideCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).create_guide(data)


@router.patch("/guides/{guide_id}", response_model=ExcursionGuideResponse)
async def update_guide(
    guide_id: UUID,
    data: ExcursionGuideUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).update_guide(guide_id, data)


@router.get("/guides/usage", response_model=list[ExcursionGuideUsageGroup])
async def list_guides_usage(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Занятость экскурсоводов по экскурсиям в периоде."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.modules.excursions.models import Excursion, ExcursionGuide
    from app.modules.excursions.usage import build_guide_usage
    from app.modules.rafting.models import TransportVehicle

    df, dt = normalize_usage_range(date_from, date_to)
    guides_rows = await db.execute(select(ExcursionGuide))
    guides = guides_rows.scalars().all()

    stmt = (
        select(Excursion, TransportVehicle)
        .outerjoin(TransportVehicle, TransportVehicle.id == Excursion.vehicle_id)
        .where(Excursion.excursion_date >= df, Excursion.excursion_date <= dt)
        .options(selectinload(Excursion.program_steps))
        .order_by(Excursion.excursion_date.asc(), Excursion.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return build_guide_usage(guides, rows)


# --- Экскурсии ---


@router.get("", response_model=list[ExcursionListItem])
async def list_excursions(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).list_excursions(
        date_from=date_from, date_to=date_to, offset=offset, limit=limit
    )


@router.post("", response_model=ExcursionDetailResponse, status_code=201)
async def create_excursion(
    data: ExcursionCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    payload = data.model_dump()
    payload["title"] = (payload.get("title") or "").strip()
    return await ExcursionService(db).create_excursion(ExcursionCreate(**payload))


@router.get("/{excursion_id}", response_model=ExcursionDetailResponse)
async def get_excursion(
    excursion_id: UUID,
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).get_detail(excursion_id)


@router.patch("/{excursion_id}", response_model=ExcursionDetailResponse)
async def update_excursion(
    excursion_id: UUID,
    data: ExcursionUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).update_excursion(excursion_id, data)


@router.post("/{excursion_id}/program-steps", response_model=ExcursionDetailResponse, status_code=201)
async def add_program_step(
    excursion_id: UUID,
    data: ExcursionProgramStepCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).add_program_step(excursion_id, data)


@router.delete("/{excursion_id}/program-steps/{step_id}", status_code=204)
async def delete_program_step(
    excursion_id: UUID,
    step_id: UUID,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    await ExcursionService(db).delete_program_step(excursion_id, step_id)


@router.post(
    "/{excursion_id}/program-steps/{step_id}/objects",
    response_model=ExcursionDetailResponse,
    status_code=201,
)
async def add_program_object(
    excursion_id: UUID,
    step_id: UUID,
    data: ExcursionProgramObjectAdd,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).add_program_object(
        excursion_id,
        step_id,
        name=data.name,
        asset_id=data.asset_id,
        capacity=data.capacity,
        unit_price=data.unit_price,
        sort_order=data.sort_order,
    )


@router.delete("/{excursion_id}/program-objects/{object_id}", status_code=204)
async def delete_program_object(
    excursion_id: UUID,
    object_id: UUID,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    await ExcursionService(db).delete_program_object(excursion_id, object_id)


@router.post("/{excursion_id}/clients", response_model=ExcursionDetailResponse, status_code=201)
async def add_excursion_client(
    excursion_id: UUID,
    data: ExcursionClientLinkCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).add_client_link(
        excursion_id,
        data.client_id,
        data.guests_count,
        data.notes,
        data.client_notified,
    )


@router.patch("/{excursion_id}/clients/{link_id}", response_model=ExcursionDetailResponse)
async def update_excursion_client(
    excursion_id: UUID,
    link_id: UUID,
    data: ExcursionClientLinkUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await ExcursionService(db).update_client_link(excursion_id, link_id, data)


@router.delete("/{excursion_id}/clients/{link_id}", status_code=204)
async def remove_excursion_client(
    excursion_id: UUID,
    link_id: UUID,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    await ExcursionService(db).remove_client_link(excursion_id, link_id)
