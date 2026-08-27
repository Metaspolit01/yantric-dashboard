"""
Yantric Agent Config Loader

Fetches dynamic agent configuration from the Yantric Dashboard API.
The Python LiveKit agent calls this at runtime to load the correct
system prompt, STT language, TTS voice, and other settings for any agent_id.

This is how one LiveKit worker handles ALL Yantric customers' agents
without any code changes per customer.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json

log = logging.getLogger(__name__)


@dataclass
class YantricAgentConfig:
    agent_id: str
    name: str
    business_name: str
    system_prompt: str
    greeting_message: str
    language: str  # Primary language (backward compatibility)
    languages: list[str]  # Array of supported languages
    voice: str
    llm_model: str
    stt_language: str
    tts_language: str
    tts_speaker: str


def load_agent_config(agent_id: str) -> YantricAgentConfig:
    """
    Fetch agent configuration from the Yantric Dashboard API.

    The Dashboard API URL and secret must be set in environment variables:
    - YANTRIC_API_BASE_URL: e.g. http://localhost:3001
    - YANTRIC_AGENT_API_SECRET: shared secret (must match dashboard .env.local)
    """
    api_base = os.getenv("YANTRIC_API_BASE_URL", "http://localhost:3001").rstrip("/")
    api_secret = os.getenv("YANTRIC_AGENT_API_SECRET", "")

    if not api_secret:
        raise RuntimeError(
            "Missing YANTRIC_AGENT_API_SECRET environment variable. "
            "Set this in agent-dashboard/.env to match the dashboard .env.local"
        )

    url = f"{api_base}/api/agent-config/{agent_id}"
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {api_secret}",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        log.info(f"[Yantric] Loading config for agent_id={agent_id} from {url}")
        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"[Yantric] Failed to load agent config ({e.code}): {body}"
        ) from e
    except URLError as e:
        raise RuntimeError(
            f"[Yantric] Cannot connect to dashboard at {url}: {e.reason}\n"
            "Make sure the dashboard app is running (cd dashboard-app && npm run dev)"
        ) from e

    log.info(f"[Yantric] Config loaded: {data.get('name')} for {data.get('business_name')}")

    # Handle both single language (string) and multiple languages (array)
    primary_language = data.get("language", "en-IN")
    languages_data = data.get("languages", [])
    
    # If languages array is not provided or empty, use the primary language as default
    if not languages_data or not isinstance(languages_data, list) or len(languages_data) == 0:
        languages_data = [primary_language] if primary_language else ["en-IN"]
    
    return YantricAgentConfig(
        agent_id=data["agent_id"],
        name=data["name"],
        business_name=data["business_name"],
        system_prompt=data["system_prompt"],
        greeting_message=data["greeting_message"],
        language=primary_language,
        languages=languages_data,
        voice=data.get("voice", "priya"),
        llm_model=data.get("llm_model", "google/gemma-4-31b-it"),
        stt_language=primary_language,
        tts_language=primary_language,
        tts_speaker=data.get("tts_speaker", "priya"),
    )


def extract_agent_id_from_room(room_name: str) -> str | None:
    """
    Extract agent_id from a LiveKit room name.

    Convention: room names from the Yantric dashboard follow the pattern:
    - yantric-test-<agent_id>-<timestamp>    (test calls from dashboard)
    - yantric-<agent_id>                      (direct/production calls)

    Falls back to LIVEKIT_AGENT_ID env var if no match.
    """
    if not room_name:
        return os.getenv("LIVEKIT_AGENT_ID")

    parts = room_name.split("-")

    # Pattern: yantric-test-<uuid>-<timestamp>
    # UUID has format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 parts)
    if len(parts) >= 7 and parts[0] == "yantric" and parts[1] == "test":
        # Reconstruct UUID from parts 2-6
        agent_id = "-".join(parts[2:7])
        log.info(f"[Yantric] Extracted agent_id={agent_id} from test room={room_name}")
        return agent_id

    # Pattern: yantric-<uuid>
    if len(parts) >= 6 and parts[0] == "yantric":
        agent_id = "-".join(parts[1:6])
        log.info(f"[Yantric] Extracted agent_id={agent_id} from room={room_name}")
        return agent_id

    # Fallback to env var
    return os.getenv("LIVEKIT_AGENT_ID")
