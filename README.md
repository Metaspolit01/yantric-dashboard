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

## 3) Run the Yantric dashboard

The multi-tenant dashboard lives in `dashboard-app`. Copy `dashboard-app/.env.example`
to `dashboard-app/.env.local`, set the Supabase, LiveKit and `YANTRIC_AGENT_API_SECRET`
values, then apply the SQL migrations in `supabase/migrations` to your Supabase project.

Install the dashboard dependencies and start it:

```bash
cd dashboard-app
npm install
npm run dev
```

Open `http://localhost:3001`. Customers can create accounts, configure their own
agent, upload text-based PDFs or web/text knowledge, test it over LiveKit, and manage
calls and credits. Set the same `YANTRIC_AGENT_API_SECRET` and
`YANTRIC_API_BASE_URL=http://localhost:3001` in the Python worker environment.

## 4) Install agent dependencies

```bash
uv sync
```

If you do not use uv:

```bash
pip install -e .
pip install -e .[dev]
```

## 5) Run the voice agent

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

## 6) Run tests

```bash
uv run pytest
```

Dashboard unit tests (knowledge chunking pipeline):

```bash
cd dashboard-app
npm test
```

## Knowledge base (RAG)

Yantric uses true retrieval-augmented generation: uploaded knowledge
(PDF / website / text) is cleaned, chunked, and embedded with Google
`gemini-embedding-001`, stored in Supabase via pgvector, and retrieved
during calls through the agent's `search_knowledge` tool.

Setup:

1. Apply `supabase/migrations/20260826090000_knowledge_chunks_rag.sql`
   (enables pgvector, creates `knowledge_chunks` and the similarity-search RPC).
2. Add to `dashboard-app/.env.local` (see `.env.example`):
   - `EMBEDDING_PROVIDER=google`
   - `GOOGLE_AI_API_KEY=<your Google AI Studio key>`
3. Restart the dashboard. New uploads are indexed automatically.

Without embedding config, uploads keep working in legacy mode (content is
truncated into the system prompt). Sources uploaded before RAG stay in that
mode until re-uploaded.

## Prompt customization

Edit the instructions in `prompts/assistant_prompt.txt`.

To use another prompt file, set `AGENT_PROMPT_PATH` in `.env`.

## Call completion & billing

When any call ends (dashboard test, outbound campaign, or inbound phone
call), the Python worker reports the outcome to the dashboard:

```
session close → POST /api/calls/by-room/<room>/complete
              → duration + transcript saved
              → finalize_call_billing() charges credits exactly once,
                clamps to balance, writes the ledger entry,
                and bumps agent totals
```

Billing is atomic in Postgres (`finalize_call_billing`), so retries or
crashes can never double-charge. Test calls are blocked with HTTP 402 when
the account has zero credits.

## Telephony (Vobiz AI)

Calls to real phones run through **Vobiz** via its SIP trunk registered in
LiveKit. Twilio has been fully removed from the codebase — outbound dialing
lives in `dialer.py` (provider-neutral, SIP-based) and `make_call.py` places
single test calls through the same trunk.

### Outbound campaigns

1. In Vobiz: buy a number + enable the outbound SIP trunk (see Vobiz's
   LiveKit integration guide for the domain/username/password).
2. In LiveKit: create an **outbound SIP trunk** from those credentials and
   copy its trunk ID.
3. Set `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` (and `DIALER_ENABLED=true`) in the
   worker `.env`.
4. Dashboard → Campaigns → upload `.xlsx`/`.csv` (column named *phone* /
   *mobile* / first column), pick the agent, press **Start**.

The worker polls `/api/dialer/poll`, dispatches itself into room
`yantric-<agent_id>-out-<contact_id>`, dials through the trunk, and every
conversation lands in Calls with duration, transcript, caller number, and
charged credits. Campaign progress updates live; pause/resume anytime.

### Inbound calls

1. In Vobiz: route your DID to your LiveKit inbound SIP trunk.
2. In LiveKit: create a dispatch rule for that DID that targets room
   `yantric-<agent_id>` and dispatches `yantric-agent`.
3. Dashboard → Campaigns → "Inbound Numbers": map the number to the agent
   so it is recorded and visible.

Callers then reach the agent directly; conversations are logged and billed
identically to other calls.

## Notes on realism

Natural pauses are primarily controlled by:
- Prompt style in `prompts/assistant_prompt.txt`
- TTS pacing and chunk settings in `.env` (`SARVAM_TTS_PACE`, `SARVAM_TTS_MIN_BUFFER_SIZE`, `SARVAM_TTS_MAX_CHUNK_LENGTH`)

Tune one value at a time and listen to multi-turn conversations to avoid choppy speech.
