import os
import sys
from pathlib import Path

import pytest
from livekit.agents import inference

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent
from agent import Assistant

def test_livekit_model_builds_custom_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeLLM:
        def __init__(self, model: str, **kwargs: object) -> None:
            captured["model"] = model
            captured["kwargs"] = kwargs

    monkeypatch.setenv("LIVEKIT_LLM_MODEL", "google/gemma-4-31b-it")
    monkeypatch.setattr(agent.inference, "LLM", FakeLLM)

    assistant = Assistant()

    assert assistant is not None
    assert captured["model"] == "google/gemma-4-31b-it"
    assert captured["kwargs"] == {}


def test_build_llm_requires_a_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LIVEKIT_LLM_MODEL", raising=False)

    with pytest.raises(RuntimeError, match="Missing required environment variable: LIVEKIT_LLM_MODEL"):
        Assistant()


def test_build_twilio_call_payload_uses_env_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TWILIO_TO_NUMBER", "+15551234567")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+15557654321")
    monkeypatch.setenv("TWILIO_STATUS_CALLBACK_URL", "https://example.com/status")

    payload = agent._build_twilio_call_payload("wss://example.com/connect")

    assert payload["To"] == "+15551234567"
    assert payload["From"] == "+15557654321"
    assert '<Stream url="wss://example.com/connect" />' in payload["Twiml"]
    assert payload["StatusCallback"] == "https://example.com/status"


@pytest.mark.asyncio
async def test_agent_entrypoint_triggers_twilio_call(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    class FakeSession:
        async def start(self, room, agent):
            calls.append("start")

        async def generate_reply(self, instructions):
            calls.append(instructions)

    class FakeCtx:
        class Room:
            name = "room-123"

        room = Room()

        async def connect(self):
            calls.append("connect")

        async def wait_for_participant(self):
            calls.append("wait_for_participant")

    async def fake_twilio_call(room_name: str) -> dict[str, object] | None:
        calls.append(f"room:{room_name}")
        calls.append("twilio")
        return {"sid": "CA123"}

    async def fake_connect_url(room_name: str) -> str:
        calls.append(f"connect-url:{room_name}")
        return "wss://example.com/connect"

    monkeypatch.setenv("LIVEKIT_LLM_MODEL", "google/gemma-4-31b-it")
    monkeypatch.setenv("TWILIO_AUTO_DIAL_ON_STARTUP", "true")
    monkeypatch.setattr(agent, "build_session", lambda: FakeSession())
    monkeypatch.setattr(agent, "_maybe_place_twilio_outbound_call", fake_twilio_call)
    monkeypatch.setattr(agent, "_get_twilio_connect_url", fake_connect_url)
    monkeypatch.setattr(agent, "Assistant", lambda: "assistant")

    await agent.voice_agent_entrypoint(FakeCtx())

    assert calls[0] == "start"
    assert calls[1] == "connect"
    assert calls[2] == "room:room-123"
    assert calls[3] == "twilio"
    assert any("Greet the user warmly" in item for item in calls if isinstance(item, str))
