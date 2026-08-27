# HR Voice Agent (LiveKit + Sarvam)

Sample real-time LiveKit Cloud voice agent configured for:
- Sarvam STT
- Sarvam TTS
- LiveKit default recommended LLM via env (`LIVEKIT_LLM_MODEL=google/gemma-4-31b-it`)
- Optional outbound-call integration via Twilio on agent startup
- Prompt instructions loaded from a separate file

## 1) Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) recommended
- LiveKit Cloud project with:
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
Sarvam API key:
  - `SARVAM_API_KEY`

To place an outbound phone call through Twilio when `agent.py` starts, set:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_TO_NUMBER`
- `TWILIO_AUTO_DIAL_ON_STARTUP=true`

The agent itself stays on LiveKit inference. Twilio is used to place the phone call, and LiveKit provides the media-stream bridge so the agent speaks through the call instead of the terminal.

## 2) Configure environment

Update values in `.env`.

All runtime/provider configuration is read from `.env`; no API keys are hardcoded in source.

## 3) Install dependencies

```bash
uv sync
```

If you do not use uv:

```bash
pip install -e .
pip install -e .[dev]
```

## 4) Run the voice agent

Console mode (local terminal interaction):

```bash
uv run python agent.py console
```

Development mode (for Agent Console/frontend/telephony):

```bash
uv run python agent.py dev
```

Production mode:

```bash
uv run python agent.py start
```

## 5) Run tests

```bash
uv run pytest
```

To verify the dashboard telephony helper:

```bash
cd dashboard
npm test
```

## Prompt customization

Edit the instructions in `prompts/assistant_prompt.txt`.

To use another prompt file, set `AGENT_PROMPT_PATH` in `.env`.

## Notes on realism

Natural pauses are primarily controlled by:
- Prompt style in `prompts/assistant_prompt.txt`
- TTS pacing and chunk settings in `.env` (`SARVAM_TTS_PACE`, `SARVAM_TTS_MIN_BUFFER_SIZE`, `SARVAM_TTS_MAX_CHUNK_LENGTH`)

Tune one value at a time and listen to multi-turn conversations to avoid choppy speech.
