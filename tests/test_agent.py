import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent
from agent import resolve_assistant_class
from agent_config_loader import YantricAgentConfig, extract_agent_id_from_room
from knowledge_client import search_agent_knowledge


def make_config(**overrides) -> YantricAgentConfig:
    base = dict(
        agent_id="a1b2c3d4-0000-1111-2222-333344445555",
        name="Receptionist",
        business_name="Test Clinic",
        system_prompt="You are a clinic assistant.",
        greeting_message="Hello!",
        language="en-IN",
        voice="priya",
        llm_model="google/gemma-4-31b-it",
        stt_language="en-IN",
        tts_language="en-IN",
        tts_speaker="priya",
        kb_enabled=False,
    )
    base.update(overrides)
    return YantricAgentConfig(**base)


# ─── Room-name → agent_id resolution ─────────────────────────────────────────

def test_extract_agent_id_from_test_room():
    room = f"yantric-test-{make_config().agent_id}-1730000000000"
    assert extract_agent_id_from_room(room) == make_config().agent_id


def test_extract_agent_id_from_production_room():
    room = f"yantric-{make_config().agent_id}"
    assert extract_agent_id_from_room(room) == make_config().agent_id


def test_extract_agent_id_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("LIVEKIT_AGENT_ID", "env-agent-id")
    assert extract_agent_id_from_room("unrelated-room") == "env-agent-id"


# ─── RAG assistant class selection ───────────────────────────────────────────

def test_plain_assistant_when_kb_disabled():
    assert resolve_assistant_class(make_config(kb_enabled=False)) is agent.YantricAssistant


def test_rag_assistant_when_kb_enabled():
    assert resolve_assistant_class(make_config(kb_enabled=True)) is agent.YantricAssistantWithKnowledge


def test_rag_assistant_exposes_search_tool():
    assert getattr(agent.YantricAssistantWithKnowledge, "search_knowledge", None) is not None


def test_plain_assistant_has_no_search_tool():
    assert getattr(agent.YantricAssistant, "search_knowledge", None) is None


# ─── Voice config validation ─────────────────────────────────────────────────

def test_sample_rate_validation():
    assert agent._validate_sarvam_tts_sample_rate(22050) == 22050
    with pytest.raises(RuntimeError):
        agent._validate_sarvam_tts_sample_rate(12345)


def test_speaker_validation_and_mapping():
    assert agent._validate_sarvam_tts_speaker("shubh") == "shubh"
    assert agent._validate_sarvam_tts_speaker("meera") == "priya"  # legacy alias
    assert agent._validate_sarvam_tts_speaker("does-not-exist") == "priya"  # safe fallback


# ─── Knowledge search client ─────────────────────────────────────────────────

def test_empty_query_short_circuits_before_config(monkeypatch):
    monkeypatch.delenv("YANTRIC_AGENT_API_SECRET", raising=False)
    assert search_agent_knowledge("any-agent", "   ") == []


def test_missing_secret_raises_clear_error(monkeypatch):
    monkeypatch.delenv("YANTRIC_AGENT_API_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="YANTRIC_AGENT_API_SECRET"):
        search_agent_knowledge("any-agent", "clinic timings")
