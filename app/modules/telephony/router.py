from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.telephony.schemas import (
    MtsVatsImportResponse,
    MtsVatsHistoryResponse,
    TelephonyCallRow,
    TelephonyWebhookEventRow,
)

router = APIRouter(prefix="/telephony", tags=["telephony"])


def _pick_payload_value(payload: dict, *keys: str):
    for key in keys:
        v = payload.get(key)
        if v not in (None, ""):
            return v
    return None


async def _fetch_mts_history_sample(
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[dict | list | str | None, str | None, int | None, list[str]]:
    import httpx
    import time as pytime

    from app.core.config import settings

    base = (settings.MTS_VATS_API_BASE_URL or "").strip().rstrip("/")
    key = (settings.MTS_VATS_API_KEY or "").strip()
    if not base or not key:
        return None, None, None, []

    df = date_from or (date.today() - timedelta(days=7))
    dt = date_to or date.today()

    paths = ["/calls", "/history", "/cdr", "/calls/list", "/call/list", "/cdr/list", "/events"]
    header_variants = [
        {"Authorization": key},
        {"Authorization": f"Bearer {key}"},
        {"Authorization": f"Token {key}"},
        {"X-API-Key": key},
        {"X-Auth-Token": key},
        {"X-Token": key},
        {"X-MTS-Token": key},
        {"X-MTS-Auth": key},
        {"X-Access-Token": key},
    ]
    query_variants = [{}, {"token": key}, {"access_token": key}, {"api_key": key}, {"key": key}]
    date_range_variants = [
        {"date_from": df.isoformat(), "date_to": dt.isoformat()},
        {"from": df.isoformat(), "to": dt.isoformat()},
        {"start": df.isoformat(), "end": dt.isoformat()},
        {"start_date": df.isoformat(), "end_date": dt.isoformat()},
        {"period_from": df.isoformat(), "period_to": dt.isoformat()},
    ]
    tried: list[str] = []
    deadline_ts = pytime.monotonic() + 24.0  # frontend timeout is 30s
    max_attempts = 40

    async with httpx.AsyncClient(timeout=3.5, follow_redirects=True) as client:
        for p in paths:
            url = f"{base}{p}"
            for dr in date_range_variants:
                for q in query_variants:
                    params = dict(dr)
                    params.update(q or {})
                    for h in header_variants:
                        if len(tried) >= max_attempts or pytime.monotonic() >= deadline_ts:
                            return None, p, None, tried
                        label = (
                            f"GET {p} headers={','.join(h.keys())}"
                            + (f" query={','.join(params.keys())}" if params else "")
                        )
                        tried.append(label)
                        try:
                            r = await client.get(url, headers=h, params=params or None)
                        except Exception:
                            continue
                        text = (r.text or "").strip()
                        if r.status_code in (400, 401) and ("Empty token" in text or "Invalid token" in text):
                            continue
                        if r.status_code >= 400:
                            continue
                        try:
                            data = r.json()
                        except Exception:
                            data = text[:2000]
                        return data, p, r.status_code, tried
    return None, None, None, tried


def _extract_history_rows(sample: dict | list | str | None) -> list[dict]:
    if isinstance(sample, list):
        return [x for x in sample if isinstance(x, dict)]
    if not isinstance(sample, dict):
        return []
    candidates = [
        sample.get("items"),
        sample.get("calls"),
        sample.get("data"),
        sample.get("results"),
        sample.get("history"),
        sample.get("records"),
    ]
    for c in candidates:
        if isinstance(c, list):
            return [x for x in c if isinstance(x, dict)]
    return []


@router.get("/calls", response_model=list[TelephonyCallRow])
async def list_calls(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Список всех звонков, уже попавших в CRM (source=telephony)."""
    from sqlalchemy import select

    from app.modules.clients.models import Client
    from app.modules.leads.models import Lead
    from app.shared.enums import LeadSource

    stmt = (
        select(Lead, Client)
        .outerjoin(Client, Client.id == Lead.client_id)
        .where(Lead.source == LeadSource.TELEPHONY.value)
        .order_by(Lead.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    out: list[TelephonyCallRow] = []
    for lead, client in rows:
        rp = lead.raw_payload or {}
        rec = None
        if isinstance(rp, dict):
            rec = rp.get("recording_url") or rp.get("recording")
        client_name = None
        client_phone = None
        if client is not None:
            client_name = f"{client.first_name} {client.last_name}".strip() or None
            client_phone = client.phone
        out.append(
            TelephonyCallRow(
                lead_id=lead.id,
                created_at=lead.created_at,
                status=str(lead.status),
                call_id=lead.source_ref,
                client_id=lead.client_id,
                client_name=client_name,
                client_phone=client_phone,
                comment=lead.comment,
                recording_url=str(rec) if rec else None,
                converted_deal_id=lead.converted_deal_id,
            )
        )
    return out


@router.get("/events", response_model=list[TelephonyWebhookEventRow])
async def list_webhook_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    current_user=require_permission("integrations", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Сырые события телефонии (webhook_logs) — полезно для диагностики, даже если лид не создался."""
    from sqlalchemy import select

    from app.modules.integrations.models import WebhookLog

    stmt = (
        select(WebhookLog)
        .where(WebhookLog.source.in_(["telephony", "mts_vats"]))
        .order_by(WebhookLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = (await db.execute(stmt)).scalars().all()

    def pick(d: dict, *keys: str):
        for k in keys:
            v = d.get(k)
            if v not in (None, ""):
                return v
        return None

    out: list[TelephonyWebhookEventRow] = []
    for l in logs:
        rp = l.raw_payload or {}
        caller = None
        call_id = None
        rec = None
        if isinstance(rp, dict):
            caller = pick(rp, "caller_id", "caller", "from", "from_number", "ani", "external_number", "phone")
            call_id = pick(rp, "call_id", "callId", "callid", "session_id", "sessionId", "uuid", "id")
            rec = pick(rp, "recording_url", "recordingUrl", "record_url", "recordUrl", "recording", "record")
            if rec is None:
                call = rp.get("call")
                if isinstance(call, dict):
                    rec = pick(call, "recording_url", "recordingUrl", "recording")
        out.append(
            TelephonyWebhookEventRow(
                webhook_id=l.id,
                created_at=l.created_at,
                source=l.source,
                is_processed=bool(l.is_processed),
                error=l.error,
                caller_phone=str(caller) if caller else None,
                call_id=str(call_id) if call_id else None,
                recording_url=str(rec) if rec else None,
                raw_payload=rp if isinstance(rp, dict) else None,
            )
        )
    return out


@router.get("/mts/history", response_model=MtsVatsHistoryResponse)
async def fetch_mts_vats_history(
    current_user=require_permission("integrations", "read"),
):
    """
    Попытка получить историю звонков напрямую из MTS VATS CRM API.
    Пока реализовано как "probe": пробуем несколько типовых путей и вариантов передачи ключа.
    """
    from app.core.config import settings

    base = (settings.MTS_VATS_API_BASE_URL or "").strip()
    key = (settings.MTS_VATS_API_KEY or "").strip()
    if not base:
        return MtsVatsHistoryResponse(ok=False, message="Не задан MTS_VATS_API_BASE_URL в .env")
    if not key:
        return MtsVatsHistoryResponse(ok=False, message="Не задан MTS_VATS_API_KEY в .env")

    sample, path, status_code, tried = await _fetch_mts_history_sample()
    if sample is None:
        return MtsVatsHistoryResponse(
            ok=False,
            message="Не удалось получить ответ от MTS API.",
            tried=tried,
            status_code=status_code,
            sample=sample,
            last_attempt=None,
        )
    return MtsVatsHistoryResponse(
        ok=True,
        message=f"OK ({path})",
        tried=tried,
        status_code=status_code,
        sample=sample,
        last_attempt=path,
    )


@router.post("/mts/import-history", response_model=MtsVatsImportResponse)
async def import_mts_vats_history(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user=require_permission("integrations", "write"),
    db: AsyncSession = Depends(get_db),
):
    """
    Импортировать историю звонков из MTS VATS API в CRM (лиды + клиенты телефонии).
    """
    from app.modules.integrations.service import IntegrationService

    sample, path, _status_code, _tried = await _fetch_mts_history_sample(date_from=date_from, date_to=date_to)
    rows = _extract_history_rows(sample)
    if not rows:
        return MtsVatsImportResponse(
            ok=False,
            message="История не найдена или формат ответа MTS не распознан",
            source_path=path,
        )

    service = IntegrationService(db)
    imported = 0
    skipped = 0
    for row in rows:
        direction = _pick_payload_value(row, "direction", "call_direction")
        if isinstance(direction, str) and direction.lower() not in {"in", "incoming", "inbound"}:
            skipped += 1
            continue

        caller_phone = _pick_payload_value(
            row, "caller_id", "caller", "from", "from_number", "ani", "external_number", "phone"
        )
        if not caller_phone and isinstance(row.get("call"), dict):
            caller_phone = _pick_payload_value(row.get("call", {}), "from", "caller", "phone")
        if not caller_phone:
            skipped += 1
            continue

        mapped = {
            "caller_id": str(caller_phone),
            "call_id": _pick_payload_value(row, "call_id", "callId", "callid", "session_id", "sessionId", "uuid", "id"),
            "event": _pick_payload_value(row, "event", "type", "event_type", "call_event"),
            "direction": direction,
            "comment": _pick_payload_value(row, "status", "state", "event"),
            "raw_payload": dict(row),
        }
        await service._process_telephony_payload(mapped, str(caller_phone))
        imported += 1

    return MtsVatsImportResponse(
        ok=True,
        message="Импорт завершён",
        imported=imported,
        skipped=skipped,
        total_seen=len(rows),
        source_path=path,
    )

