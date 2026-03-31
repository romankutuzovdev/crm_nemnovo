from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.clients.models import Client, Company
from app.modules.deals.repository import DealRepository
from app.modules.excursions.models import (
    Excursion,
    ExcursionClientLink,
    ExcursionGuide,
    ExcursionProgramObject,
    ExcursionProgramStep,
)
from app.modules.excursions.schemas import (
    ExcursionClientBrief,
    ExcursionClientLinkResponse,
    ExcursionClientLinkUpdate,
    ExcursionCreate,
    ExcursionDetailResponse,
    ExcursionGuideCreate,
    ExcursionGuideResponse,
    ExcursionGuideUpdate,
    ExcursionListItem,
    ExcursionProgramObjectResponse,
    ExcursionProgramStepCreate,
    ExcursionProgramStepResponse,
    ExcursionUpdate,
    PayerCompanyBrief,
    TransportVehicleBrief,
)
from app.modules.rafting.models import TransportVehicle
from app.modules.rafting.repository import TransportVehicleRepository


async def _validate_excursion_refs(
    session: AsyncSession,
    *,
    guide_id: UUID | None,
    vehicle_id: UUID | None,
    deal_id: UUID | None,
    payer_company_id: UUID | None,
) -> None:
    if guide_id is not None and await session.get(ExcursionGuide, guide_id) is None:
        raise ValidationError("Экскурсовод не найден")
    if vehicle_id is not None:
        await TransportVehicleRepository(session).get_or_raise(vehicle_id)
    if deal_id is not None:
        await DealRepository(session).get_or_raise(deal_id)
    if payer_company_id is not None and await session.get(Company, payer_company_id) is None:
        raise ValidationError("Организация-плательщик не найдена")


class ExcursionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_guides(self) -> list[ExcursionGuideResponse]:
        result = await self.session.execute(
            select(ExcursionGuide).order_by(ExcursionGuide.created_at.desc())
        )
        return [ExcursionGuideResponse.model_validate(x) for x in result.scalars().all()]

    async def create_guide(self, data: ExcursionGuideCreate) -> ExcursionGuideResponse:
        body = data.model_dump()
        body["full_name"] = (body.get("full_name") or "").strip()
        g = ExcursionGuide(**body)
        self.session.add(g)
        await self.session.flush()
        await self.session.refresh(g)
        return ExcursionGuideResponse.model_validate(g)

    async def update_guide(self, guide_id: UUID, data: ExcursionGuideUpdate) -> ExcursionGuideResponse:
        g = await self.session.get(ExcursionGuide, guide_id)
        if g is None:
            raise NotFoundError("Guide not found")
        body = data.model_dump(exclude_unset=True, mode="python")
        if "full_name" in body and body["full_name"] is not None:
            body["full_name"] = str(body["full_name"]).strip()
        for k, v in body.items():
            setattr(g, k, v)
        await self.session.flush()
        await self.session.refresh(g)
        return ExcursionGuideResponse.model_validate(g)

    async def _vehicle_brief(self, vid: UUID | None) -> TransportVehicleBrief | None:
        if vid is None:
            return None
        row = await self.session.get(TransportVehicle, vid)
        if row is None:
            return None
        name = f"{row.brand} {(row.model or '')}".strip() or row.brand
        return TransportVehicleBrief(id=row.id, name=name, plate_number=row.plate_number)

    def _step_to_response(self, step: ExcursionProgramStep) -> ExcursionProgramStepResponse:
        objs = sorted(step.objects, key=lambda x: (x.sort_order, x.name))
        return ExcursionProgramStepResponse(
            id=step.id,
            excursion_id=step.excursion_id,
            sort_order=step.sort_order,
            start_time=step.start_time,
            end_time=step.end_time,
            title=step.title,
            description=step.description,
            objects=[
                ExcursionProgramObjectResponse(
                    id=o.id,
                    step_id=o.step_id,
                    asset_id=o.asset_id,
                    sort_order=o.sort_order,
                    name=o.name,
                    capacity=o.capacity,
                    unit_price=float(o.unit_price),
                )
                for o in objs
            ],
        )

    async def _excursion_to_detail(self, ex: Excursion) -> ExcursionDetailResponse:
        steps = sorted(ex.program_steps, key=lambda s: (s.sort_order, s.title))
        step_responses = [self._step_to_response(s) for s in steps]

        client_rows = await self.session.execute(
            select(ExcursionClientLink, Client)
            .join(Client, Client.id == ExcursionClientLink.client_id)
            .where(ExcursionClientLink.excursion_id == ex.id)
        )
        links: list[ExcursionClientLinkResponse] = []
        for link, client in client_rows.all():
            links.append(
                ExcursionClientLinkResponse(
                    id=link.id,
                    excursion_id=link.excursion_id,
                    client_id=link.client_id,
                    guests_count=link.guests_count,
                    notes=link.notes,
                    client_notified=link.client_notified,
                    client=ExcursionClientBrief(
                        id=client.id,
                        first_name=client.first_name,
                        last_name=client.last_name,
                        phone=client.phone,
                    ),
                )
            )

        guide_resp = None
        if ex.guide:
            guide_resp = ExcursionGuideResponse.model_validate(ex.guide)

        payer_brief: PayerCompanyBrief | None = None
        payer_company_name: str | None = None
        if ex.payer_company_id is not None:
            co = await self.session.get(Company, ex.payer_company_id)
            if co is not None:
                payer_brief = PayerCompanyBrief(id=co.id, name=co.name, inn=co.inn)
                payer_company_name = co.name

        return ExcursionDetailResponse(
            id=ex.id,
            title=ex.title,
            excursion_date=ex.excursion_date,
            status=ex.status,
            payment_status=ex.payment_status,
            guide_id=ex.guide_id,
            vehicle_id=ex.vehicle_id,
            deal_id=ex.deal_id,
            payer_company_id=ex.payer_company_id,
            payer_company_name=payer_company_name,
            income_total=float(ex.income_total),
            expense_total=float(ex.expense_total),
            transport_income=float(ex.transport_income) if ex.transport_income is not None else None,
            transport_expense=float(ex.transport_expense) if ex.transport_expense is not None else None,
            guide_fee=float(ex.guide_fee) if ex.guide_fee is not None else None,
            created_at=ex.created_at,
            notes=ex.notes,
            guide=guide_resp,
            vehicle=await self._vehicle_brief(ex.vehicle_id),
            payer_company=payer_brief,
            program_steps=step_responses,
            client_links=links,
        )

    async def list_excursions(
        self,
        *,
        date_from: date | None,
        date_to: date | None,
        offset: int,
        limit: int,
    ) -> list[ExcursionListItem]:
        stmt = select(Excursion).order_by(Excursion.excursion_date.desc(), Excursion.created_at.desc())
        if date_from is not None:
            stmt = stmt.where(Excursion.excursion_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Excursion.excursion_date <= date_to)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        co_ids = {r.payer_company_id for r in rows if r.payer_company_id is not None}
        co_names: dict[UUID, str] = {}
        if co_ids:
            co_rows = await self.session.execute(select(Company).where(Company.id.in_(co_ids)))
            for c in co_rows.scalars().all():
                co_names[c.id] = c.name
        return [
            ExcursionListItem(
                id=r.id,
                title=r.title,
                excursion_date=r.excursion_date,
                status=r.status,
                payment_status=r.payment_status,
                guide_id=r.guide_id,
                vehicle_id=r.vehicle_id,
                deal_id=r.deal_id,
                payer_company_id=r.payer_company_id,
                payer_company_name=co_names.get(r.payer_company_id) if r.payer_company_id else None,
                income_total=float(r.income_total),
                expense_total=float(r.expense_total),
                transport_income=float(r.transport_income) if r.transport_income is not None else None,
                transport_expense=float(r.transport_expense) if r.transport_expense is not None else None,
                guide_fee=float(r.guide_fee) if r.guide_fee is not None else None,
                created_at=r.created_at,
            )
            for r in rows
        ]

    async def get_detail(self, excursion_id: UUID) -> ExcursionDetailResponse:
        stmt = (
            select(Excursion)
            .where(Excursion.id == excursion_id)
            .options(
                selectinload(Excursion.guide),
                selectinload(Excursion.program_steps).selectinload(ExcursionProgramStep.objects),
            )
        )
        result = await self.session.execute(stmt)
        ex = result.scalar_one_or_none()
        if ex is None:
            raise NotFoundError("Excursion not found")
        return await self._excursion_to_detail(ex)

    async def create_excursion(self, data: ExcursionCreate) -> ExcursionDetailResponse:
        await _validate_excursion_refs(
            self.session,
            guide_id=data.guide_id,
            vehicle_id=data.vehicle_id,
            deal_id=data.deal_id,
            payer_company_id=data.payer_company_id,
        )
        ex = Excursion(
            title=data.title.strip(),
            excursion_date=data.excursion_date,
            status=data.status,
            payment_status=data.payment_status,
            guide_id=data.guide_id,
            vehicle_id=data.vehicle_id,
            deal_id=data.deal_id,
            payer_company_id=data.payer_company_id,
            income_total=data.income_total,
            expense_total=data.expense_total,
            transport_income=data.transport_income,
            transport_expense=data.transport_expense,
            guide_fee=data.guide_fee,
            notes=data.notes,
        )
        self.session.add(ex)
        await self.session.flush()
        for step_in in sorted(data.program_steps, key=lambda s: s.sort_order):
            step = ExcursionProgramStep(
                excursion_id=ex.id,
                sort_order=step_in.sort_order,
                start_time=step_in.start_time,
                end_time=step_in.end_time,
                title=step_in.title.strip(),
                description=step_in.description,
            )
            self.session.add(step)
            await self.session.flush()
            for obj_in in sorted(step_in.objects, key=lambda o: o.sort_order):
                self.session.add(
                    ExcursionProgramObject(
                        step_id=step.id,
                        asset_id=obj_in.asset_id,
                        sort_order=obj_in.sort_order,
                        name=obj_in.name.strip(),
                        capacity=obj_in.capacity,
                        unit_price=obj_in.unit_price,
                    )
                )
        await self.session.flush()
        return await self.get_detail(ex.id)

    async def update_excursion(self, excursion_id: UUID, data: ExcursionUpdate) -> ExcursionDetailResponse:
        ex = await self.session.get(Excursion, excursion_id)
        if ex is None:
            raise NotFoundError("Excursion not found")
        body = data.model_dump(exclude_unset=True, mode="python")
        if "title" in body and body["title"] is not None:
            body["title"] = str(body["title"]).strip()
        for k, v in body.items():
            setattr(ex, k, v)
        await self.session.flush()
        await _validate_excursion_refs(
            self.session,
            guide_id=ex.guide_id,
            vehicle_id=ex.vehicle_id,
            deal_id=ex.deal_id,
            payer_company_id=ex.payer_company_id,
        )
        return await self.get_detail(excursion_id)

    async def add_program_step(self, excursion_id: UUID, data: ExcursionProgramStepCreate) -> ExcursionDetailResponse:
        ex = await self.session.get(Excursion, excursion_id)
        if ex is None:
            raise NotFoundError("Excursion not found")
        step = ExcursionProgramStep(
            excursion_id=excursion_id,
            sort_order=data.sort_order,
            start_time=data.start_time,
            end_time=data.end_time,
            title=data.title.strip(),
            description=data.description,
        )
        self.session.add(step)
        await self.session.flush()
        for obj_in in sorted(data.objects, key=lambda o: o.sort_order):
            self.session.add(
                ExcursionProgramObject(
                    step_id=step.id,
                    asset_id=obj_in.asset_id,
                    sort_order=obj_in.sort_order,
                    name=obj_in.name.strip(),
                    capacity=obj_in.capacity,
                    unit_price=obj_in.unit_price,
                )
            )
        await self.session.flush()
        return await self.get_detail(excursion_id)

    async def delete_program_step(self, excursion_id: UUID, step_id: UUID) -> None:
        step = await self.session.get(ExcursionProgramStep, step_id)
        if step is None or step.excursion_id != excursion_id:
            raise NotFoundError("Step not found")
        await self.session.delete(step)
        await self.session.flush()

    async def add_program_object(
        self, excursion_id: UUID, step_id: UUID, *, name: str, asset_id: UUID | None, capacity: int | None, unit_price: float, sort_order: int
    ) -> ExcursionDetailResponse:
        step = await self.session.get(ExcursionProgramStep, step_id)
        if step is None or step.excursion_id != excursion_id:
            raise NotFoundError("Step not found")
        self.session.add(
            ExcursionProgramObject(
                step_id=step_id,
                asset_id=asset_id,
                sort_order=sort_order,
                name=name.strip(),
                capacity=capacity,
                unit_price=unit_price,
            )
        )
        await self.session.flush()
        return await self.get_detail(excursion_id)

    async def delete_program_object(self, excursion_id: UUID, object_id: UUID) -> None:
        obj = await self.session.get(ExcursionProgramObject, object_id)
        if obj is None:
            raise NotFoundError("Object not found")
        step = await self.session.get(ExcursionProgramStep, obj.step_id)
        if step is None or step.excursion_id != excursion_id:
            raise NotFoundError("Object not found")
        await self.session.delete(obj)
        await self.session.flush()

    async def add_client_link(
        self,
        excursion_id: UUID,
        client_id: UUID,
        guests_count: int,
        notes: str | None,
        client_notified: bool = False,
    ) -> ExcursionDetailResponse:
        ex = await self.session.get(Excursion, excursion_id)
        if ex is None:
            raise NotFoundError("Excursion not found")
        client = await self.session.get(Client, client_id)
        if client is None:
            raise ValidationError("Клиент не найден")
        existing = await self.session.execute(
            select(ExcursionClientLink).where(
                ExcursionClientLink.excursion_id == excursion_id,
                ExcursionClientLink.client_id == client_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ValidationError("Клиент уже в списке этой экскурсии")
        self.session.add(
            ExcursionClientLink(
                excursion_id=excursion_id,
                client_id=client_id,
                guests_count=guests_count,
                notes=notes,
                client_notified=client_notified,
            )
        )
        await self.session.flush()
        return await self.get_detail(excursion_id)

    async def update_client_link(
        self, excursion_id: UUID, link_id: UUID, data: ExcursionClientLinkUpdate
    ) -> ExcursionDetailResponse:
        link = await self.session.get(ExcursionClientLink, link_id)
        if link is None or link.excursion_id != excursion_id:
            raise NotFoundError("Link not found")
        if data.client_notified is not None:
            link.client_notified = data.client_notified
        if data.guests_count is not None:
            link.guests_count = data.guests_count
        if data.notes is not None:
            link.notes = data.notes
        await self.session.flush()
        return await self.get_detail(excursion_id)

    async def remove_client_link(self, excursion_id: UUID, link_id: UUID) -> None:
        link = await self.session.get(ExcursionClientLink, link_id)
        if link is None or link.excursion_id != excursion_id:
            raise NotFoundError("Link not found")
        await self.session.delete(link)
        await self.session.flush()
