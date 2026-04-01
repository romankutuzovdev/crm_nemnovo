from __future__ import annotations

from collections import defaultdict
from datetime import time
from uuid import UUID

from app.modules.excursions.models import Excursion, ExcursionGuide
from app.modules.excursions.schemas import ExcursionGuideResponse, ExcursionGuideUsageGroup, ExcursionUsageSlot
from app.modules.rafting.models import TransportVehicle


def _vehicle_summary(veh: TransportVehicle | None) -> str | None:
    if veh is None:
        return None
    label = " ".join(p for p in (veh.brand, veh.model or "") if p).strip()
    if veh.plate_number:
        suffix = veh.plate_number
        return f"{label} · {suffix}" if label else suffix
    return label or None


def _excursion_time_bounds(ex: Excursion) -> tuple[time | None, time | None]:
    starts = [s.start_time for s in (ex.program_steps or []) if s.start_time is not None]
    ends = [s.end_time for s in (ex.program_steps or []) if s.end_time is not None]
    return (min(starts) if starts else None, max(ends) if ends else None)


def excursion_to_usage_slot(ex: Excursion, joined_vehicle: TransportVehicle | None) -> ExcursionUsageSlot:
    st, et = _excursion_time_bounds(ex)
    return ExcursionUsageSlot(
        excursion_id=ex.id,
        excursion_date=ex.excursion_date,
        start_time=st,
        end_time=et,
        title=ex.title,
        status=ex.status,
        deal_id=ex.deal_id,
        vehicle_summary=_vehicle_summary(joined_vehicle),
    )


def build_guide_usage(
    guides: list[ExcursionGuide],
    rows: list[tuple[Excursion, TransportVehicle | None]],
) -> list[ExcursionGuideUsageGroup]:
    by_g: dict[UUID, list[ExcursionUsageSlot]] = defaultdict(list)
    for ex, jveh in rows:
        if ex.guide_id is None:
            continue
        by_g[ex.guide_id].append(excursion_to_usage_slot(ex, jveh))

    def sort_key(x: ExcursionUsageSlot) -> tuple:
        return (x.excursion_date, x.start_time or time(0, 0), x.title.lower())

    return [
        ExcursionGuideUsageGroup(
            guide=ExcursionGuideResponse.model_validate(g),
            events=sorted(by_g.get(g.id, []), key=sort_key),
        )
        for g in sorted(guides, key=lambda x: x.full_name.lower())
    ]

