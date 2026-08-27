"""
Yantric Call Reporting Client

The worker's half of the usage/billing loop. When a LiveKit session ends,
agent.py calls complete_call(), which reports the outcome to the dashboard:

    session close
        → POST {YANTRIC_API_BASE_URL}/api/calls/by-room/{room}/complete
        → dashboard finalizes duration, transcript and credit deduction

Runs synchronously (urllib) and is safe to invoke from a plain thread.
Failures raise RuntimeError; callers log-and-continue so a billing hiccup
never breaks the voice experience.
"""

from __future__ import annotations

import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import quote

log = logging.getLogger(__name__)


def complete_call(
    room_name: str,
    *,
    status: str = "completed",
    duration_seconds: int | None = None,
    transcript: str | None = None,
    summary: str | None = None,
    caller_phone: str | None = None,
    recording_url: str | None = None,
    timeout: int = 15,
) -> dict:
    """Report call completion to the Yantric dashboard API."""
    api_base = os.getenv("YANTRIC_API_BASE_URL", "http://localhost:3001").rstrip("/")
    api_secret = os.getenv("YANTRIC_AGENT_API_SECRET", "")

    if not api_secret:
        raise RuntimeError(
            "Missing YANTRIC_AGENT_API_SECRET environment variable."
        )

    url = f"{api_base}/api/calls/by-room/{quote(room_name, safe='')}/complete"
    body: dict[str, object] = {"status": status}
    if duration_seconds is not None:
        body["duration_seconds"] = int(max(0, duration_seconds))
    if transcript:
        body["transcript"] = transcript[:200_000]
    if summary:
        body["summary"] = summary[:10_000]
    if caller_phone:
        body["caller_phone"] = caller_phone
    if recording_url:
        body["recording_url"] = recording_url[:2000]

    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Call completion failed ({e.code}): {detail}") from e
    except URLError as e:
        raise RuntimeError(f"Cannot reach dashboard at {url}: {e.reason}") from e

    log.info(
        "[Yantric] Call reported: room=%s status=%s credits_charged=%s",
        room_name, status, data.get("creditsCharged"),
    )
    return data
