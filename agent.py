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
import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    cli,
    function_tool,
    inference,
)
from livekit.plugins import sarvam
from livekit.agents import tts as livekit_tts

from agent_config_loader import (
    YantricAgentConfig,
    extract_agent_id_from_room,
    load_agent_config,
)
from knowledge_client import search_agent_knowledge
from reporting_client import complete_call

import dialer

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
    """

    def __init__(self, config: YantricAgentConfig | None = None) -> None:
        if config is not None:
            system_prompt = config.system_prompt
            llm_model = config.llm_model
            log.info(
                f"[Yantric] Initializing agent: {config.name} "
                f"for {config.business_name} "
                f"(lang={config.language}, voice={config.voice})"
            )
        else:
            # Fallback: use local prompt file (development mode)
            system_prompt = _load_fallback_prompt()
            llm_model = _require_env("LIVEKIT_LLM_MODEL")
            log.warning(
                "[Yantric] No agent config loaded — using fallback prompt. "
                "Set LIVEKIT_AGENT_ID env var or use the dashboard to test."
            )

        super().__init__(
            llm=inference.LLM(model=llm_model),
            instructions=system_prompt,
        )
        self._config = config


class YantricAssistantWithKnowledge(YantricAssistant):
    """
    Voice agent with retrieval over the customer's knowledge base (RAG).

    The LLM calls search_knowledge whenever it needs business facts that
    are not in the base instructions. Retrieved chunks are returned to the
    LLM as tool output — they are never pre-stuffed into the prompt.
    """

    @function_tool
    async def search_knowledge(self, context: RunContext, query: str) -> str:
        """Search the business knowledge base for information needed to answer the caller's question.

        Args:
            query: Short search phrase describing the missing business detail.
        """
        config = self._config
        if config is None:
            return "No knowledge base is available for this agent."

        try:
            chunks = await asyncio.to_thread(
                search_agent_knowledge, config.agent_id, query
            )
        except Exception as exc:
            log.warning(f"[Yantric] Knowledge search failed: {exc}")
            return (
                "The knowledge base is temporarily unavailable. "
                "Answer politely without inventing details and suggest "
                "contacting the business directly."
            )

        if not chunks:
            return (
                "No matching information was found in the business knowledge "
                "base. Do not guess; say you don't have that detail and offer "
                "to help another way."
            )

        return "\n\n---\n\n".join(chunks[:4])


def resolve_assistant_class(
    config: YantricAgentConfig | None,
) -> type[YantricAssistant]:
    """Pick the assistant class based on whether RAG retrieval is enabled."""
    if config is not None and getattr(config, "kb_enabled", False):
        return YantricAssistantWithKnowledge
    return YantricAssistant


# ─── Multi-language voice engine ──────────────────────────────────────────────

# Languages Sarvam bulbul TTS can voice (keep in sync with dashboard
# src/lib/languages.ts). STT understands more, but the agent must be able
# to SPEAK a language for it to be selectable.
SUPPORTED_TTS_LANGUAGES = {
    "en-IN", "hi-IN", "te-IN", "ta-IN", "kn-IN", "ml-IN",
    "mr-IN", "bn-IN", "gu-IN", "pa-IN", "od-IN",
}

_LANG_TAG_RE = re.compile(r"^\s*<lang:([a-zA-Z]{2,3}-[A-Za-z0-9]{2,4})>\s*")


def _split_language_tag(text: str, default_lang: str) -> tuple[str, str]:
    """Extracts a leading <lang:xx-XX> tag; returns (language, clean_text)."""
    match = _LANG_TAG_RE.match(text or "")
    if not match:
        return default_lang, text or ""
    return match.group(1), (text or "")[match.end():]


class MultiLanguageTTS(livekit_tts.TTS):
    """
    Voice engine that switches TTS language per reply.

    The system prompt instructs the LLM to prefix every reply in multi-language
    mode with <lang:xx-XX>. This wrapper strips the tag and speaks the text
    with a cached per-language Sarvam voice, falling back to the primary voice
    for untagged/unknown text. Streaming is disabled so each sentence is
    synthesized through synthesize(), where the language is known.
    """

    def __init__(self, factory, default_lang: str, languages: list[str]) -> None:
        self._factory = factory
        self._default_lang = default_lang if default_lang in SUPPORTED_TTS_LANGUAGES else "en-IN"
        self._allowed = {l for l in languages if l in SUPPORTED_TTS_LANGUAGES}
        self._allowed.add(self._default_lang)
        self._instances: dict[str, livekit_tts.TTS] = {}
        self._default = self._get(self._default_lang)

        capabilities = livekit_tts.TTSCapabilities(streaming=False)
        try:
            super().__init__(capabilities=capabilities)
        except TypeError:
            try:
                super().__init__(capabilities=capabilities, sample_rate=22050, num_channels=1)
            except TypeError:
                super().__init__()

        # Mirror identity/metadata from the underlying plugin instance.
        for attr in ("model", "vendor", "provider", "sample_rate", "num_channels", "label"):
            try:
                setattr(self, attr, getattr(self._default, attr))
            except Exception:
                pass

    def _get(self, lang: str) -> livekit_tts.TTS:
        if lang not in self._allowed:
            lang = self._default_lang
        instance = self._instances.get(lang)
        if instance is None:
            instance = self._factory(lang)
            self._instances[lang] = instance
        return instance

    def synthesize(self, text: str, **kwargs):
        lang, clean = _split_language_tag(text, self._default_lang)
        clean = clean.strip() or (text or "").strip()
        inner = self._get(lang)
        try:
            return inner.synthesize(clean, **kwargs)
        except TypeError:
            return inner.synthesize(clean)

    def stream(self, **kwargs):
        # Capabilities advertise streaming=False, but delegate if ever called.
        return self._default.stream(**kwargs)


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

    languages = list(getattr(config, "languages", None) or ([tts_language] if config else []))
    multi_language = len(languages) > 1
    if multi_language:
        log.info(f"[Yantric] Multi-language agent: {languages} (STT auto-detect: {stt_language})")

    def _make_tts(lang: str) -> sarvam.TTS:
        safe_lang = lang if lang in SUPPORTED_TTS_LANGUAGES else tts_language
        return sarvam.TTS(
            target_language_code=safe_lang,
            model=os.getenv("SARVAM_TTS_MODEL", "bulbul:v3"),
            speaker=tts_speaker,
            speech_sample_rate=tts_sample_rate,
            pace=_get_float("SARVAM_TTS_PACE", 1.0),
            temperature=_get_float("SARVAM_TTS_TEMPERATURE", 0.6),
            min_buffer_size=_get_int("SARVAM_TTS_MIN_BUFFER_SIZE", 30),
            max_chunk_length=_get_int("SARVAM_TTS_MAX_CHUNK_LENGTH", 100),
            send_completion_event=_get_bool("SARVAM_TTS_SEND_COMPLETION_EVENT", True),
        )

    base_tts = _make_tts(tts_language)
    tts = (
        MultiLanguageTTS(factory=_make_tts, default_lang=tts_language, languages=languages)
        if multi_language
        else base_tts
    )

    return AgentSession(
        stt=sarvam.STT(
            language=stt_language,
            model=os.getenv("SARVAM_STT_MODEL", "saaras:v3"),
            mode=os.getenv("SARVAM_STT_MODE", "transcribe"),
            sample_rate=_get_int("SARVAM_STT_SAMPLE_RATE", 16000),
            high_vad_sensitivity=_get_bool("SARVAM_STT_HIGH_VAD_SENSITIVITY", False),
            flush_signal=_get_bool("SARVAM_STT_FLUSH_SIGNAL", True),
        ),
        tts=tts,
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),
        preemptive_generation=True,
    )


# ─── Call recording (LiveKit egress, real calls only) ────────────────────────

def _is_test_room(room_name: str) -> bool:
    """Dashboard test calls are never recorded (product decision)."""
    return room_name.startswith("yantric-test-") or "-out-test-" in room_name


async def _maybe_start_recording(room_name: str) -> str | None:
    """
    Starts audio-only room egress for REAL calls (outbound campaigns, inbound).
    Requires RECORDING_ENABLED=true + RECORDING_S3_BUCKET (storage credentials
    are configured on the LiveKit/egress side). Returns egress_id or None.
    """
    if not _get_bool("RECORDING_ENABLED", False) or _is_test_room(room_name):
        return None
    bucket = os.getenv("RECORDING_S3_BUCKET", "").strip()
    if not bucket:
        log.warning("[Yantric] RECORDING_ENABLED is on but RECORDING_S3_BUCKET is not set — skipping recording.")
        return None
    try:
        from livekit import api as livekit_api

        async with livekit_api.LiveKitAPI() as lk:
            info = await lk.egress.start_room_composite_egress(
                livekit_api.RoomCompositeEgressRequest(
                    room_name=room_name,
                    audio_only=True,
                    file_outputs=[
                        livekit_api.EncodedFileOutput(
                            file_type=livekit_api.EncodedFileType.MP4,
                            filepath=f"s3://{bucket}/recordings/{room_name}/{int(_time.time())}.mp4",
                        )
                    ],
                )
            )
        log.info(f"[Yantric] Recording started for {room_name} (egress={info.egress_id})")
        return info.egress_id
    except Exception as exc:  # recording must never block a live call
        log.warning(f"[Yantric] Could not start recording for {room_name}: {exc}")
        return None


def _fetch_recording_url(room_name: str, egress_id: str) -> str | None:
    """Waits (bounded) for egress to finish and returns the file location."""
    async def _poll() -> str | None:
        from livekit import api as livekit_api

        async with livekit_api.LiveKitAPI() as lk:
            for _ in range(10):
                infos = await lk.egress.list_egress(
                    livekit_api.ListEgressRequest(room_name=room_name, egress_id=egress_id)
                )
                info = infos[0] if infos else None
                status = str(getattr(info, "status", "")).upper() if info else ""
                if "COMPLETE" in status:
                    for item in list(getattr(info, "file_results", None) or []):
                        loc = getattr(item, "location", "") or ""
                        if loc:
                            return loc
                    result = getattr(info, "result", None)
                    for item in list(getattr(result, "file_results", None) or []):
                        loc = getattr(item, "location", "") or ""
                        if loc:
                            return loc
                    return None
                if any(marker in status for marker in ("FAILED", "ABORTED", "LIMIT_EXCEEDED")):
                    return None
                await asyncio.sleep(5)
        return None

    try:
        return asyncio.run(_poll())
    except Exception as exc:
        log.warning(f"[Yantric] Recording URL fetch failed for {room_name}: {exc}")
        return None


# ─── Call reporting helpers ───────────────────────────────────────────────────

def _extract_caller_phone(participant: object | None) -> str | None:
    """Best-effort caller phone number from SIP participant attributes/identity."""
    if participant is None:
        return None
    attrs = getattr(participant, "attributes", None) or {}
    for key in ("sip.callerNumber", "sip.caller_number", "callerNumber", "caller_phone"):
        value = attrs.get(key)
        if value:
            return str(value)
    identity = str(getattr(participant, "identity", "") or "")
    digits = identity.lstrip("+")
    if digits.isdigit() and 8 <= len(digits) <= 15:
        return identity if identity.startswith("+") else f"+{digits}"
    return None


def _transcript_text(history: object | None) -> str | None:
    """Serialize the session chat history into a simple transcript string."""
    if history is None:
        return None
    lines: list[str] = []
    try:
        for item in getattr(history, "items", None) or []:
            role = str(getattr(item, "role", "") or "").replace("Role.", "").lower()
            content = getattr(item, "content", None)
            text = " ".join(str(c) for c in (content or []) if isinstance(c, str)).strip()
            if not text:
                continue
            speaker = (
                "Caller" if "user" in role
                else "Agent" if "assistant" in role or "agent" in role
                else "System"
            )
            lines.append(f"{speaker}: {text}")
    except Exception as exc:  # never let transcript issues break a call report
        log.warning(f"[Yantric] Transcript serialization failed: {exc}")
        return None
    return "\n".join(lines) if lines else None


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

    # Start watchdog + campaign dialer threads once (thread-safe)
    if not _watchdog_started:
        _watchdog_started = True
        import threading
        t = threading.Thread(target=_idle_watchdog_thread, daemon=True, name="idle-watchdog")
        t.start()
        log.info(f"[Yantric] Idle watchdog started ({_IDLE_TIMEOUT // 60} min timeout).")

        # Outbound campaign dialer (Vobiz SIP trunk via LiveKit).
        try:
            dialer.start_dialer_thread()
        except Exception as exc:  # never block agent startup on dialer issues
            log.warning(f"[Yantric] Dialer failed to start: {exc}")

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
        agent=resolve_assistant_class(config)(config),
    )

    await ctx.connect()

    # ── Step 4: Recording + usage/billing loop ───────────────────────────────
    state: dict[str, object] = {"started_at": None, "caller_phone": None, "reported": False, "egress_id": None}

    # Real calls (campaigns/inbound) are recorded when configured; test calls never are.
    try:
        state["egress_id"] = await _maybe_start_recording(room_name)
    except Exception as exc:
        log.warning(f"[Yantric] Recording start error: {exc}")

    def _report_completion(*_args: object) -> None:
        """Runs once on session close — reports duration/transcript for billing."""
        if state["reported"]:
            return
        state["reported"] = True
        started_at = state["started_at"]
        duration = int(_time.time() - started_at) if isinstance(started_at, float) else 0
        status = "completed" if duration >= 1 else "no_answer"
        transcript = _transcript_text(getattr(session, "history", None))
        caller_phone = str(state["caller_phone"] or "") or None
        egress_id = str(state["egress_id"] or "") or None

        import threading

        def _safe_report() -> None:
            recording_url = None
            if egress_id:
                recording_url = _fetch_recording_url(room_name, egress_id)
            try:
                complete_call(
                    room_name,
                    status=status,
                    duration_seconds=duration,
                    transcript=transcript,
                    caller_phone=caller_phone,
                    recording_url=recording_url,
                )
            except Exception as exc:
                log.warning(f"[Yantric] Completion report failed for {room_name}: {exc}")

        threading.Thread(
            target=_safe_report, daemon=True, name="yantric-completion-report"
        ).start()

    session.on("close", _report_completion)

    # Wait for participant to join before greeting (skip wait if already present)
    remote = getattr(ctx, "remote_participants", None) or {}
    participant = next(iter(remote.values()), None)
    if participant is None:
        try:
            participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=15)
        except asyncio.TimeoutError:
            participant = None
            log.warning("[Yantric] No participant within 15s — starting session anyway.")
    state["started_at"] = _time.time()
    state["caller_phone"] = _extract_caller_phone(participant)

    try:
        static_greeting = (config.greeting_message if config else "").strip()
        if static_greeting:
            # Defensive: never speak internal <lang:…> tags even if one slips
            # into the stored greeting, and log exactly what will be spoken.
            _, static_greeting = _split_language_tag(static_greeting, "en-IN")
            log.info(f"[Yantric] Speaking greeting verbatim: {static_greeting!r}")
            # Speak the configured greeting instantly via TTS — no LLM roundtrip,
            # so the caller hears the exact stored text, ~1-3s sooner.
            await session.say(static_greeting, allow_interruptions=True)
        else:
            # No static greeting configured — fall back to LLM-phrased greeting.
            await session.generate_reply(
                instructions=os.getenv(
                    "INITIAL_REPLY_INSTRUCTIONS",
                    "Greet the user warmly, then ask how you can help.",
                )
            )
    finally:
        # Safety net in case the close event never fires (process teardown).
        _report_completion()


if __name__ == "__main__":
    cli.run_app(server)
