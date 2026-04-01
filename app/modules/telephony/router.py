from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.telephony.schemas import (
    MtsVatsHistoryResponse,
    TelephonyCallRow,
    TelephonyWebhookEventRow,
)

router = APIRouter(prefix="/telephony", tags=["telephony"])


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
    import httpx

    from app.core.config import settings

    base = (settings.MTS_VATS_API_BASE_URL or "").strip()
    key = (settings.MTS_VATS_API_KEY or "").strip()
    if not base:
        return MtsVatsHistoryResponse(ok=False, message="Не задан MTS_VATS_API_BASE_URL в .env")
    if not key:
        return MtsVatsHistoryResponse(ok=False, message="Не задан MTS_VATS_API_KEY в .env")

    base = base.rstrip("/")
    paths = [
        "/calls",
        "/calls/list",
        "/call/list",
        "/cdr",
        "/cdr/list",
        "/history",
        "/events",
    ]
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
    query_variants = [
        {},
        # token in query (some installations use query auth)
        {"token": key},
        {"access_token": key},
        {"key": key},
        {"api_key": key},
    ]

    # Some endpoints require an explicit date range; try a few common parameter names.
    from datetime import date, timedelta

    today = date.today()
    week_ago = today - timedelta(days=7)
    date_range_variants = [
        {"date_from": week_ago.isoformat(), "date_to": today.isoformat()},
        {"from": week_ago.isoformat(), "to": today.isoformat()},
        {"start": week_ago.isoformat(), "end": today.isoformat()},
        {"start_date": week_ago.isoformat(), "end_date": today.isoformat()},
        {"period_from": week_ago.isoformat(), "period_to": today.isoformat()},
    ]

    tried: list[str] = []
    last_attempt: str | None = None
    last_status: int | None = None
    last_sample: dict | list | str | None = None
    timeout = 15.0
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for p in paths:
            url = f"{base}{p}"
            for dr in date_range_variants:
                for q in query_variants:
                    params = dict(dr)
                    params.update(q or {})
                    for h in header_variants:
                        label = (
                            f"GET {p} headers={','.join(h.keys())}"
                            + (f" query={','.join(params.keys())}" if params else "")
                        )
                        tried.append(label)
                        try:
                            r = await client.get(url, headers=h, params=params or None)
                        except Exception as e:
                            return MtsVatsHistoryResponse(ok=False, message=f"Ошибка сети: {e}", tried=tried)

                        # "Empty token" / "Invalid token" — частые ошибки авторизации; продолжаем перебор.
                        text = (r.text or "").strip()
                        if r.status_code in (400, 401) and ("Empty token" in text or "Invalid token" in text):
                            last_attempt = label
                            last_status = r.status_code
                            try:
                                last_sample = r.json()
                            except Exception:
                                last_sample = text[:1000]
                            continue
                        if r.status_code >= 400:
                            # Если это уже другая ошибка — вернём её как подсказку.
                            sample = None
                            try:
                                sample = r.json()
                            except Exception:
                                sample = text[:1000]
                            return MtsVatsHistoryResponse(
                                ok=False,
                                message=f"MTS API вернул ошибку {r.status_code}",
                                tried=tried,
                                status_code=r.status_code,
                                sample=sample,
                                last_attempt=label,
                            )

                        # success
                        try:
                            data = r.json()
                        except Exception:
                            data = text[:2000]
                        return MtsVatsHistoryResponse(
                            ok=True,
                            message=f"OK ({p})",
                            tried=tried,
                            status_code=r.status_code,
                            sample=data,
                            last_attempt=label,
                        )

    if last_status is not None:
        return MtsVatsHistoryResponse(
            ok=False,
            message="MTS API не принял токен (Empty token / Invalid token).",
            tried=tried,
            status_code=last_status,
            sample=last_sample,
            last_attempt=last_attempt,
        )
    return MtsVatsHistoryResponse(ok=False, message="Не удалось получить ответ от MTS API.", tried=tried)

