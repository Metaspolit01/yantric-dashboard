"""
Yantric Voice Agent Engine

A single LiveKit voice-agent worker that dynamically loads configuration
for any customer agent based on the agent_id encoded in the room name.

This is the core of the Yantric platform:
  room name → agent_id → Yantric API → config → run voice agent

One worker process handles ALL customer agents.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape as xml_escape

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
)
from livekit.api import LiveKitAPI
from livekit.protocol.connector_twilio import ConnectTwilioCallRequest
from livekit.plugins import sarvam
from livekit.plugins.sarvam.llm import LLM as SarvamLLM

from agent_config_loader import (
    YantricAgentConfig,
    extract_agent_id_from_room,
    load_agent_config,
)

import time as _time

load_dotenv(".env")

log = logging.getLogger(__name__)

# ─── Idle auto-shutdown ───────────────────────────────────────────────────────
_last_job_time: float = _time.time()
_IDLE_TIMEOUT: int = int(os.getenv("AGENT_IDLE_TIMEOUT_MINUTES", "30")) * 60
_watchdog_started: bool = False

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    return int(raw.strip())


def _get_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    return float(raw.strip())


def _validate_sarvam_tts_sample_rate(sample_rate: int) -> int:
    allowed = {8000, 16000, 22050, 24000}
    if sample_rate not in allowed:
        allowed_values = ", ".join(str(v) for v in sorted(allowed))
        raise RuntimeError(
            f"Invalid SARVAM_TTS_SAMPLE_RATE={sample_rate}. Supported values: {allowed_values}."
        )
    return sample_rate


VALID_SARVAM_SPEAKERS = {
    "shubh", "ritu", "rahul", "pooja", "simran", "kavya", "amit", "ratan",
    "rohan", "dev", "ishita", "shreya", "manan", "sumit", "priya", "aditya",
    "kabir", "neha", "varun", "roopa", "aayan", "ashutosh", "advait", "amelia",
    "sophia", "suhani", "rupali", "tanya", "shruti", "kavitha"
}

SPEAKER_MAPPINGS = {
    "arjun": "shubh",
    "meera": "priya",
}


def _validate_sarvam_tts_speaker(speaker: str) -> str:
    s = (speaker or "").lower().strip()
    if s in VALID_SARVAM_SPEAKERS:
        return s
    if s in SPEAKER_MAPPINGS:
        mapped = SPEAKER_MAPPINGS[s]
        log.warning(f"[Yantric] Speaker '{speaker}' mapped to compatible speaker '{mapped}'.")
        return mapped
    log.warning(f"[Yantric] Speaker '{speaker}' is not supported by Sarvam bulbul:v3. Falling back to 'priya'.")
    return "priya"


# ─── Fallback prompt loader (used when no agent_id is found) ──────────────────

def _load_fallback_prompt() -> str:
    """
    Load the fallback prompt from file.
    Used when running without a Yantric agent_id (e.g. direct development mode).
    """
    prompt_path = Path(os.getenv("AGENT_PROMPT_PATH", "prompts/assistant_prompt.txt"))
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    return (
        "You are a helpful AI voice assistant. "
        "Greet the caller warmly and ask how you can help them today."
    )


# ─── Dynamic Agent ────────────────────────────────────────────────────────────

class YantricAssistant(Agent):
    """
    A dynamic Yantric voice agent that loads its personality and
    instructions from the Yantric Dashboard API based on agent_id.
    
    Supports multi-language conversations with automatic language detection.
    Uses Sarvam's LLM for better Indian language support (Telugu, Hindi, etc.).
    """

    def __init__(self, config: YantricAgentConfig | None = None) -> None:
        if config is not None:
            system_prompt = config.system_prompt
            llm_model = config.llm_model
            
            # Build enhanced system prompt with multi-language instructions
            enhanced_prompt = self._build_multilingual_system_prompt(config)
            
            log.info(
                f"[Yantric] Initializing agent: {config.name} "
                f"for {config.business_name} "
                f"(languages={config.languages}, voice={config.voice})"
            )
        else:
            # Fallback: use local prompt file (development mode)
            enhanced_prompt = _load_fallback_prompt()
            llm_model = _require_env("LIVEKIT_LLM_MODEL")
            log.warning(
                "[Yantric] No agent config loaded — using fallback prompt. "
                "Set LIVEKIT_AGENT_ID env var or use the dashboard to test."
            )

        # Use Sarvam LLM for better Indian language support when available
        # Otherwise fall back to the default inference.LLM
        sarvam_api_key = os.getenv("SARVAM_API_KEY")
        if sarvam_api_key and config:
            try:
                # Use Sarvam's LLM for better multilingual support
                llm = SarvamLLM(
                    model="sarvam-105b",  # Sarvam's multilingual model
                    api_key=sarvam_api_key,
                    temperature=0.7,  # Balanced creativity/consistency
                )
                log.info("[Yantric] Using Sarvam LLM for better multilingual support")
            except Exception as e:
                log.warning(f"[Yantric] Failed to initialize Sarvam LLM: {e}. Falling back to default LLM.")
                llm = inference.LLM(model=llm_model)
        else:
            llm = inference.LLM(model=llm_model)

        super().__init__(
            llm=llm,
            instructions=enhanced_prompt,
        )
        self._config = config
        self._current_language = config.language if config else "en-IN"
    
    def _build_multilingual_system_prompt(self, config: YantricAgentConfig) -> str:
        """
        Build an enhanced system prompt that includes multi-language instructions.
        
        The agent will:
        1. Greet in the primary language
        2. If multiple languages are supported, ask user for their preference
        3. Detect and switch to the user's language automatically
        4. Inform users about supported languages if they speak an unsupported language
        
        Enhanced with Sarvam-specific instructions for better Indian language handling.
        """
        base_prompt = config.system_prompt
        
        languages = config.languages or [config.language]
        language_names = {
            "en-IN": "English",
            "te-IN": "Telugu",
            "hi-IN": "Hindi",
            "ta-IN": "Tamil",
            "kn-IN": "Kannada",
            "mr-IN": "Marathi",
            "gu-IN": "Gujarati",
            "bn-IN": "Bengali",
        }
        
        supported_lang_names = [language_names.get(lang, lang) for lang in languages]
        
        if len(languages) > 1:
            # Multi-language agent - add special instructions
            all_but_last = ', '.join(supported_lang_names[:-1])
            last = supported_lang_names[-1]
            
            multilingual_instructions = f"""

LANGUAGE CAPABILITIES (CRITICAL - FOLLOW THESE RULES STRICTLY):
You are a multilingual assistant that speaks {all_but_last} and {last}.

IMPORTANT LANGUAGE RULES - YOU MUST FOLLOW THESE:
1. DETECT THE USER'S LANGUAGE FIRST: Listen carefully to what language the user speaks. Then respond in THAT SAME LANGUAGE.

2. MIRROR THE USER'S LANGUAGE: 
   - If the user speaks English, respond ONLY in English
   - If the user speaks Telugu, respond ONLY in Telugu
   - If the user speaks Hindi, respond ONLY in Hindi
   - And so on for all supported languages
   
3. INITIAL GREETING: When starting a conversation, greet them and say: "Hello! You have reached {config.business_name}. I can speak {all_but_last} and {last}. Which language would you prefer to talk in?" Then wait for their response and use THEIR chosen language.

4. NEVER FORCE A SINGLE LANGUAGE: Do NOT always speak in one language. ALWAYS match the user's language.

5. LANGUAGE SWITCHING: If the user switches languages mid-conversation, immediately switch to their new language.

6. UNSUPPORTED LANGUAGE: If the user speaks a language you don't support, politely say: "I apologize, but I can only speak {all_but_last} and {last}. Could we continue in one of these languages?"

7. THINK IN THE USER'S LANGUAGE: Before responding, identify the language the user just spoke, then formulate your entire response in that language.

EXAMPLE SCENARIOS:
- User says "Hello" in English → You respond in English
- User says "Namaste" in Hindi → You respond in Hindi  
- User says "Namaskaram" in Telugu → You respond in Telugu
- User asks "What languages do you speak?" → Respond in the language they asked in, listing: "I can speak {all_but_last} and {last}"
"""
        else:
            # Single language agent
            primary_lang_name = language_names.get(languages[0], languages[0])
            multilingual_instructions = f"""

LANGUAGE CAPABILITIES (CRITICAL):
You speak ONLY {primary_lang_name}. 

IMPORTANT RULES:
1. ALL responses must be in {primary_lang_name} only.
2. If a user speaks to you in a different language, politely inform them: "I apologize, but I can only speak {primary_lang_name}. Could we continue in {primary_lang_name}?"
3. Never respond in any other language except {primary_lang_name}.
"""
        
        return base_prompt + multilingual_instructions


# ─── Session Builder ──────────────────────────────────────────────────────────

def build_session(config: YantricAgentConfig | None = None) -> AgentSession:
    """
    Build a LiveKit AgentSession with Sarvam STT/TTS.

    If a YantricAgentConfig is provided, uses its language/voice settings.
    Otherwise falls back to environment variables.
    """
    tts_sample_rate = _validate_sarvam_tts_sample_rate(
        _get_int("SARVAM_TTS_SAMPLE_RATE", 22050)
    )

    # Use config language/voice if available, otherwise fall back to env vars
    stt_language = config.stt_language if config else os.getenv("SARVAM_STT_LANGUAGE", "en-IN")
    tts_language = config.tts_language if config else os.getenv("SARVAM_TTS_TARGET_LANGUAGE", "en-IN")
    raw_speaker = config.tts_speaker if config else os.getenv("SARVAM_TTS_SPEAKER", "priya")
    tts_speaker = _validate_sarvam_tts_speaker(raw_speaker)

    return AgentSession(
        stt=sarvam.STT(
            language=stt_language,
            model=os.getenv("SARVAM_STT_MODEL", "saaras:v3"),
            mode=os.getenv("SARVAM_STT_MODE", "transcribe"),
            sample_rate=_get_int("SARVAM_STT_SAMPLE_RATE", 16000),
            high_vad_sensitivity=_get_bool("SARVAM_STT_HIGH_VAD_SENSITIVITY", False),
            flush_signal=_get_bool("SARVAM_STT_FLUSH_SIGNAL", True),
        ),
        tts=sarvam.TTS(
            target_language_code=tts_language,
            model=os.getenv("SARVAM_TTS_MODEL", "bulbul:v3"),
            speaker=tts_speaker,
            speech_sample_rate=tts_sample_rate,
            pace=_get_float("SARVAM_TTS_PACE", 1.0),
            temperature=_get_float("SARVAM_TTS_TEMPERATURE", 0.6),
            min_buffer_size=_get_int("SARVAM_TTS_MIN_BUFFER_SIZE", 30),
            max_chunk_length=_get_int("SARVAM_TTS_MAX_CHUNK_LENGTH", 100),
            send_completion_event=_get_bool("SARVAM_TTS_SEND_COMPLETION_EVENT", True),
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),
        preemptive_generation=True,
    )


# ─── Twilio helpers (unchanged from original) ─────────────────────────────────

def _build_twilio_twiml(connect_url: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response><Connect><Stream url="{xml_escape(connect_url)}" /></Connect></Response>'
    )


def _build_twilio_call_payload(connect_url: str) -> dict[str, str]:
    to_number = _require_env("TWILIO_TO_NUMBER")
    from_number = _require_env("TWILIO_FROM_NUMBER")
    payload: dict[str, str] = {
        "To": to_number,
        "From": from_number,
        "Twiml": _build_twilio_twiml(connect_url),
    }
    status_callback = os.getenv("TWILIO_STATUS_CALLBACK_URL")
    if status_callback:
        payload["StatusCallback"] = status_callback.strip()
    return payload


async def _get_twilio_connect_url(room_name: str) -> str:
    async with LiveKitAPI() as livekit_api:
        response = await livekit_api.connector.connect_twilio_call(
            ConnectTwilioCallRequest(
                twilio_call_direction=ConnectTwilioCallRequest.TwilioCallDirection.TWILIO_CALL_DIRECTION_OUTBOUND,
                room_name=room_name,
                participant_name=os.getenv("TWILIO_PARTICIPANT_NAME", "Phone caller"),
                participant_identity=os.getenv("TWILIO_PARTICIPANT_IDENTITY", "twilio-phone"),
                destination_country=os.getenv("TWILIO_DESTINATION_COUNTRY", "IN"),
            )
        )
    if not response.connect_url:
        raise RuntimeError("LiveKit did not return a Twilio stream connect URL.")
    return response.connect_url


def _place_twilio_outbound_call_sync(connect_url: str) -> dict[str, object]:
    account_sid = _require_env("TWILIO_ACCOUNT_SID")
    auth_token = _require_env("TWILIO_AUTH_TOKEN")
    call_url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls.json"
    payload = _build_twilio_call_payload(connect_url)
    request = Request(
        call_url,
        data=urlencode(payload).encode("utf-8"),
        headers={
            "Authorization": "Basic "
            + base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii"),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_text = response.read().decode("utf-8")
    except HTTPError as error:
        error_text = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Twilio outbound call failed ({error.code}): {error_text or error.reason}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Twilio outbound call failed: {error.reason}") from error
    return json.loads(response_text) if response_text else {}


async def _maybe_place_twilio_outbound_call(room_name: str) -> dict[str, object] | None:
    if not _get_bool("TWILIO_AUTO_DIAL_ON_STARTUP", False):
        return None
    connect_url = await _get_twilio_connect_url(room_name)
    return await asyncio.to_thread(_place_twilio_outbound_call_sync, connect_url)


# ─── LiveKit Session Entrypoint ───────────────────────────────────────────────

server = AgentServer()


def _idle_watchdog_thread() -> None:
    """Run in a daemon thread — exits the process if idle too long."""
    while True:
        _time.sleep(60)
        idle_secs = _time.time() - _last_job_time
        if idle_secs > _IDLE_TIMEOUT:
            log.warning(
                f"[Yantric] No jobs in {_IDLE_TIMEOUT // 60} min — shutting down. "
                "Restart with: uv run python agent.py dev"
            )
            os._exit(0)


@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "yantric-agent"))
async def voice_agent_entrypoint(ctx: JobContext) -> None:
    """Main LiveKit voice agent entrypoint."""
    global _last_job_time, _watchdog_started
    _last_job_time = _time.time()  # reset idle timer on every new job
    log.info("[Yantric] Job received — idle timer reset.")

    # Start watchdog daemon thread once (thread-safe, no asyncio needed)
    if not _watchdog_started:
        _watchdog_started = True
        import threading
        t = threading.Thread(target=_idle_watchdog_thread, daemon=True, name="idle-watchdog")
        t.start()
        log.info(f"[Yantric] Idle watchdog started ({_IDLE_TIMEOUT // 60} min timeout).")

    room_name = getattr(ctx.room, "name", os.getenv("LIVEKIT_ROOM_NAME", "yantric-room"))

    # ── Step 1: Resolve agent_id ──────────────────────────────────────────────
    agent_id = extract_agent_id_from_room(room_name)

    # ── Step 2: Load dynamic config ───────────────────────────────────────────
    config: YantricAgentConfig | None = None
    if agent_id:
        try:
            config = load_agent_config(agent_id)
            log.info(f"[Yantric] Loaded config for: {config.name} ({config.business_name})")
        except Exception as exc:
            log.error(f"[Yantric] Failed to load config for agent_id={agent_id}: {exc}")
            log.warning("[Yantric] Falling back to default prompt.")
    else:
        log.info("[Yantric] No agent_id found in room name — using fallback prompt.")

    # ── Step 3: Build session and start ───────────────────────────────────────
    session = build_session(config)

    await session.start(
        room=ctx.room,
        agent=YantricAssistant(config),
    )

    await ctx.connect()

    await _maybe_place_twilio_outbound_call(room_name)

    # Wait for participant to join before greeting
    await ctx.wait_for_participant()

    # Start recording - LiveKit will handle upload via webhook
    # Recording configuration is handled by LiveKit Cloud/Server settings
    # The webhook will receive the recording URL and store it in Supabase
    if config and config.agent_id:
        log.info(f"[Yantric] Call recording will be available after call completion for agent {agent_id}")

    # Use the config greeting if available, otherwise use env var or default
    greeting = (
        config.greeting_message
        if config
        else os.getenv("INITIAL_REPLY_INSTRUCTIONS", "Greet the user warmly, then ask how you can help.")
    )

    await session.generate_reply(instructions=greeting)


if __name__ == "__main__":
    cli.run_app(server)
