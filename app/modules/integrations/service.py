import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations.models import WebhookLog
from app.modules.leads.schemas import LeadFromSiteCreate
from app.modules.leads.service import LeadService

logger = structlog.get_logger()


class IntegrationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.lead_service = LeadService(session)

    async def handle_site_lead(self, payload: dict, ip_address: str = "") -> dict:
        """Process incoming lead from website. Creates/deduplicates client and lead."""
        log = WebhookLog(
            source="site",
            raw_payload=payload,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()

        try:
            data = LeadFromSiteCreate(**payload)
            lead = await self.lead_service.create_from_site(data)

            log.is_processed = True
            await self.session.flush()

            logger.info("integration.site_lead_processed", lead_id=str(lead.id))
            return {"status": "ok", "lead_id": str(lead.id)}

        except Exception as e:
            log.error = str(e)
            await self.session.flush()
            logger.error("integration.site_lead_failed", error=str(e))
            raise

    async def handle_telephony_event(self, payload: dict, ip_address: str = "") -> dict:
        """Handle incoming call from telephony provider."""
        log = WebhookLog(
            source="telephony",
            raw_payload=payload,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()

        caller_phone = payload.get("caller_id", "")
        if not caller_phone:
            log.error = "No caller_id in payload"
            await self.session.flush()
            return {"status": "ignored"}

        try:
            result = await self._process_telephony_payload(payload, caller_phone)
            log.is_processed = True
            await self.session.flush()
            return result
        except Exception as e:
            log.error = str(e)
            await self.session.flush()
            logger.error("integration.telephony_failed", error=str(e))
            raise

    async def _process_telephony_payload(self, payload: dict, caller_phone: str) -> dict:
        from app.core.exceptions import ConflictError
        from app.modules.clients.repository import ClientRepository
        from app.shared.enums import LeadSource
        from app.shared.utils import normalize_phone

        normalized_phone = normalize_phone(caller_phone)

        client_repo = ClientRepository(self.session)
        client = await client_repo.find_by_phone(normalized_phone)
        was_existing_client = client is not None
        if client is None:
            try:
                client = await client_repo.create(
                    first_name="Телефон",
                    last_name="Звонок",
                    phone=normalized_phone,
                    email=None,
                    source=LeadSource.TELEPHONY.value,
                )
            except ConflictError:
                client = await client_repo.find_by_phone(normalized_phone)
                if client is None:
                    raise

        await self.session.flush()
        return {
            "status": "ok",
            "client_id": str(client.id),
            "client_found": was_existing_client,
        }

    @staticmethod
    def _pick(payload: dict, *keys: str):
        for key in keys:
            value = payload.get(key)
            if value not in (None, ""):
                return value
        return None

    @staticmethod
    def _nested_pick(payload: dict, paths: list[tuple[str, ...]]):
        for path in paths:
            current = payload
            found = True
            for part in path:
                if not isinstance(current, dict) or part not in current:
                    found = False
                    break
                current = current[part]
            if found and current not in (None, ""):
                return current
        return None

    async def handle_mts_vats_event(self, payload: dict, ip_address: str = "") -> dict:
        """
        Handle MTS VATS webhook payload and create/update telephony lead.
        Different MTS installations may send slightly different payload keys,
        so we try several aliases and nested paths.
        """
        log = WebhookLog(
            source="mts_vats",
            raw_payload=payload,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()

        try:
            command = self._pick(payload, "command", "cmd", "method", "action")
            event = self._pick(payload, "event", "type", "event_type", "call_event", "status")
            direction = self._pick(payload, "direction", "call_direction")
            if direction is None:
                direction = self._nested_pick(payload, [("call", "direction"), ("data", "direction")])
            if isinstance(direction, str):
                direction = direction.lower()

            # Process only incoming call events.
            if direction and direction not in {"in", "incoming", "inbound"}:
                log.is_processed = True
                await self.session.flush()
                return {"status": "ignored", "reason": "not_incoming_direction"}

            if isinstance(event, str):
                event_l = event.lower()
                if any(x in event_l for x in ("outgoing", "dialout", "outbound")):
                    log.is_processed = True
                    await self.session.flush()
                    return {"status": "ignored", "reason": "not_incoming_event"}

            caller_phone = self._pick(
                payload,
                "caller_id",
                "caller",
                "from",
                "from_number",
                "ani",
                "external_number",
                "phone",
                "client_phone",
                "number",
            )
            if caller_phone is None:
                caller_phone = self._nested_pick(
                    payload,
                    [
                        ("call", "from"),
                        ("call", "caller"),
                        ("data", "caller"),
                        ("data", "phone"),
                    ],
                )

            # history/events can be sent as command + list of entries
            if not caller_phone and isinstance(payload.get("data"), list):
                imported = 0
                skipped = 0
                for item in payload.get("data", []):
                    if not isinstance(item, dict):
                        skipped += 1
                        continue
                    phone = self._pick(
                        item,
                        "caller_id",
                        "caller",
                        "from",
                        "from_number",
                        "ani",
                        "external_number",
                        "phone",
                        "client_phone",
                        "number",
                    )
                    if not phone:
                        skipped += 1
                        continue
                    row_call_id = self._pick(
                        item,
                        "call_id",
                        "callId",
                        "callid",
                        "session_id",
                        "sessionId",
                        "uuid",
                        "id",
                    )
                    row_direction = self._pick(item, "direction", "call_direction")
                    if isinstance(row_direction, str) and row_direction.lower() not in {"in", "incoming", "inbound"}:
                        skipped += 1
                        continue
                    row_payload = dict(item)
                    row_payload["_integration"] = "mts_vats"
                    row_payload["_command"] = command
                    await self._process_telephony_payload(
                        {
                            "caller_id": str(phone),
                            "call_id": str(row_call_id) if row_call_id is not None else None,
                            "event": event or command,
                            "direction": row_direction,
                            "comment": self._pick(item, "status", "state", "event", "result"),
                            "raw_payload": row_payload,
                        },
                        str(phone),
                    )
                    imported += 1
                log.is_processed = True
                await self.session.flush()
                return {"status": "ok", "imported": imported, "skipped": skipped}

            if not caller_phone:
                log.error = "No caller phone in MTS payload"
                await self.session.flush()
                return {"status": "ignored", "reason": "no_caller"}

            call_id = self._pick(
                payload,
                "call_id",
                "callId",
                "callid",
                "session_id",
                "sessionId",
                "uuid",
                "id",
            )
            if call_id is None:
                call_id = self._nested_pick(payload, [("call", "id"), ("data", "call_id")])

            recording_url = self._pick(
                payload,
                "recording_url",
                "recordingUrl",
                "record_url",
                "recordUrl",
                "recording",
                "record",
            )
            if recording_url is None:
                recording_url = self._nested_pick(
                    payload,
                    [
                        ("call", "recording_url"),
                        ("call", "recordingUrl"),
                        ("call", "recording"),
                        ("data", "recording_url"),
                        ("data", "recording"),
                    ],
                )

            mapped_payload = dict(payload)
            mapped_payload["_integration"] = "mts_vats"
            mapped_payload["_normalized"] = {
                "event": event,
                "direction": direction,
                "caller_phone": str(caller_phone),
                "call_id": str(call_id) if call_id is not None else None,
                "recording_url": str(recording_url) if recording_url is not None else None,
            }
            if recording_url is not None and "recording_url" not in mapped_payload:
                mapped_payload["recording_url"] = str(recording_url)

            # Reuse existing generic telephony flow for dedupe and lead creation.
            result = await self._process_telephony_payload(
                {
                    "caller_id": str(caller_phone),
                    "call_id": str(call_id) if call_id is not None else None,
                    "event": event,
                    "direction": direction,
                    "comment": self._pick(payload, "status", "state", "event"),
                    "raw_payload": mapped_payload,
                },
                str(caller_phone),
            )

            log.is_processed = True
            await self.session.flush()
            return result

        except Exception as e:
            log.error = str(e)
            await self.session.flush()
            logger.error("integration.mts_vats_failed", error=str(e))
            raise
