"""
Yantric Outbound Dialer Engine

Runs inside the single Yantric voice-agent worker process as a background
thread. It claims contacts queued by dashboard campaigns and places calls
through the telephony provider:

    poll /api/dialer/poll  →  job {contactId, phone, roomName, ...}
        → dispatch Yantric agent into the room
        → dial the number over the provider SIP trunk (LiveKit SIP)
        → provider connects the callee into the room as a participant
        → normal session flow: greeting → conversation → completion report

Provider: Vobiz AI (https://vobiz.ai) via its outbound SIP trunk registered
in LiveKit. The code below is deliberately provider-neutral — switching
providers means changing trunk configuration, not this file.

Required env:
    DIALER_ENABLED=true
    YANTRIC_API_BASE_URL, YANTRIC_AGENT_API_SECRET   (already required)
    LIVEKIT_SIP_OUTBOUND_TRUNK_ID                    (Vobiz trunk in LiveKit)
Optional env:
    DIALER_POLL_INTERVAL_SECONDS (default 10)
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import traceback
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

log = logging.getLogger(__name__)


# ─── Dashboard API helpers ────────────────────────────────────────────────────

def _api_request(path: str, payload: dict | None = None, timeout: int = 15) -> dict:
    """Authenticated request to a dashboard internal API. Raises RuntimeError."""
    api_base = os.getenv("YANTRIC_API_BASE_URL", "http://localhost:3001").rstrip("/")
    api_secret = os.getenv("YANTRIC_AGENT_API_SECRET", "")
    if not api_secret:
        raise RuntimeError("Missing YANTRIC_AGENT_API_SECRET environment variable.")

    url = f"{api_base}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Authorization": f"Bearer {api_secret}",
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Dialer API call failed ({e.code}) {path}: {detail}") from e
    except URLError as e:
        raise RuntimeError(f"Cannot reach dashboard at {url}: {e.reason}") from e


def poll_for_job() -> dict | None:
    """Claim the next pending campaign contact, or return None."""
    data = _api_request("/api/dialer/poll", payload={})
    return data.get("job")


def report_result(
    contact_id: str,
    *,
    success: bool,
    error: str | None = None,
    outcome: str | None = None,
) -> None:
    """Report the dialing outcome for a contact (not billing)."""
    body: dict[str, object] = {"contactId": contact_id, "success": success}
    if error:
        body["error"] = str(error)[:500]
    if outcome:
        body["outcome"] = outcome
    try:
        _api_request("/api/dialer/result", payload=body)
    except Exception as exc:
        log.warning(f"[Yantric][Dialer] Failed reporting result for {contact_id}: {exc}")


# ─── Provider dialing (Vobiz via LiveKit SIP) ────────────────────────────────

def _classify_outcome(error_text: str) -> str:
    lowered = (error_text or "").lower()
    if any(marker in lowered for marker in ("no answer", "no_answer", "480", "408", "timeout", "busy", "486")):
        return "no_answer"
    return "failed"


def place_call(job: dict) -> None:
    """
    Dispatch the agent and dial the contact into its room over the
    provider SIP trunk. Raises RuntimeError with a provider message on
    failure so report_result() can record it.
    """
    from livekit import api as livekit_api  # imported lazily: heavy + test-stubbable

    room_name = job["roomName"]
    agent_id = job["agentId"]
    phone = job["phone"]
    contact_id = job["contactId"]

    trunk_id = os.getenv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "").strip()
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "yantric-agent")

    if not trunk_id:
        raise RuntimeError(
            "LIVEKIT_SIP_OUTBOUND_TRUNK_ID is not set. Create your provider "
            "(Vobiz) outbound SIP trunk in LiveKit and put its ID in .env."
        )

    async def _run() -> None:
        lk = livekit_api.LiveKitAPI()

        # 1) Dispatch the Yantric agent FIRST so it is already waiting in the
        #    room before the callee answers (wait_for_participant never misses).
        await lk.agent_dispatch.create_dispatch(
            livekit_api.CreateAgentDispatchRequest(
                room_name=room_name,
                agent_name=agent_name,
                metadata=json.dumps({
                    "agent_id": agent_id,
                    "source": "campaign",
                    "contact_id": contact_id,
                }),
            )
        )

        # 2) Place the PSTN call through the provider SIP trunk. The callee
        #    lands in room_name as a SIP participant and the conversation starts.
        try:
            await lk.sip.create_sip_participant(
                livekit_api.CreateSipParticipantRequest(
                    sip_trunk_id=trunk_id,
                    sip_call_to=phone,
                    room_name=room_name,
                    participant_identity=f"sip-out-{contact_id}",
                    participant_name=job.get("name") or phone,
                    participant_metadata=json.dumps({"caller_phone": phone}),
                )
            )
        finally:
            await lk.aclose()

    import asyncio

    asyncio.run(_run())


# ── Worker loop ───────────────────────────────────────────────────────────────

def _dial_one(job: dict) -> None:
    contact_id = job.get("contactId", "?")
    log.info(f"[Yantric][Dialer] Dialing {job.get('phone')} (room={job.get('roomName')})")
    try:
        place_call(job)
        report_result(contact_id, success=True)
        log.info(f"[Yantric][Dialer] Call placed for contact {contact_id}.")
    except Exception as exc:  # noqa: BLE001 — one bad dial must not stop the queue
        log.error(f"[Yantric][Dialer] Dial failed for contact {contact_id}: {exc}")
        log.debug(traceback.format_exc())
        report_result(
            contact_id,
            success=False,
            error=str(exc),
            outcome=_classify_outcome(str(exc)),
        )


def start_dialer_thread() -> bool:
    """
    Start the polling loop in a daemon thread. Returns True when enabled.
    Enabled only when DIALER_ENABLED is truthy.
    """
    enabled = os.getenv("DIALER_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
    if not enabled:
        log.info("[Yantric][Dialer] Disabled (set DIALER_ENABLED=true to enable).")
        return False

    interval = int(os.getenv("DIALER_POLL_INTERVAL_SECONDS", "10"))

    def _loop() -> None:
        log.info(f"[Yantric][Dialer] Started (poll every {interval}s).")
        while True:
            try:
                job = poll_for_job()
                if job:
                    _dial_one(job)
                    continue  # drain the queue without waiting
            except Exception as exc:  # noqa: BLE001 — the loop must survive anything
                log.warning(f"[Yantric][Dialer] Poll error: {exc}")
            time.sleep(interval)

    threading.Thread(target=_loop, daemon=True, name="yantric-dialer").start()
    return True
