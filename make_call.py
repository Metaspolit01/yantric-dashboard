#!/usr/bin/env python3
"""
Place a single test outbound call through your Vobiz SIP trunk (via LiveKit)
and dispatch the Yantric voice agent into the call room.

Usage:
    1. Make sure the agent worker is running in terminal 1:
       uv run python agent.py dev

    2. Place the test call in terminal 2:
       uv run python make_call.py +919876543210 [agent_id]

       - phone number is required (E.164 format)
       - agent_id is optional; defaults to LIVEKIT_AGENT_ID in .env

Requires LIVEKIT_SIP_OUTBOUND_TRUNK_ID (your Vobiz outbound trunk) in .env.
"""

import asyncio
import os
import sys
import uuid

from dotenv import load_dotenv

load_dotenv(".env")

from livekit import api as livekit_api


async def place_call(to_number: str, agent_id: str | None) -> None:
    trunk_id = os.getenv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "").strip()
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "yantric-agent")

    if not trunk_id or trunk_id.startswith("PASTE"):
        print("❌ Set LIVEKIT_SIP_OUTBOUND_TRUNK_ID in .env first")
        print("   (Vobiz console → SIP trunk credentials → LiveKit outbound trunk ID)")
        sys.exit(1)

    if agent_id:
        room_name = f"yantric-{agent_id}-out-test-{uuid.uuid4().hex[:8]}"
    else:
        print("⚠️  No agent_id given — worker will use the fallback prompt.")
        room_name = f"yantric-testcall-{uuid.uuid4().hex[:12]}"

    print("📞 Placing outbound call via Vobiz SIP trunk…")
    print(f"   From:  {os.getenv('LIVEKIT_SIP_OUTBOUND_TRUNK_ID')}")
    print(f"   To:    {to_number}")
    print(f"   Agent: {agent_name}" + (f" ({agent_id})" if agent_id else ""))
    print(f"   Room:  {room_name}")

    lk = livekit_api.LiveKitAPI()
    try:
        # Dispatch the agent FIRST so it is waiting when the callee answers.
        await lk.agent_dispatch.create_dispatch(
            livekit_api.CreateAgentDispatchRequest(
                room_name=room_name,
                agent_name=agent_name,
                metadata=f'{{"source": "test-call"}}',
            )
        )
        await lk.sip.create_sip_participant(
            livekit_api.CreateSipParticipantRequest(
                sip_trunk_id=trunk_id,
                sip_call_to=to_number,
                room_name=room_name,
                participant_identity=f"sip-out-{uuid.uuid4().hex[:8]}",
                participant_metadata=f'{{"caller_phone": "{to_number}"}}',
            )
        )
    finally:
        await lk.aclose()

    print("✅ Call placed. The conversation will appear in Dashboard → Calls.")


if __name__ == "__main__":
    number = sys.argv[1] if len(sys.argv) > 1 else os.getenv("OUTBOUND_TEST_NUMBER", "")
    agent = sys.argv[2] if len(sys.argv) > 2 else os.getenv("LIVEKIT_AGENT_ID") or None

    if not number:
        print("Usage: uv run python make_call.py <phone-number> [agent_id]")
        sys.exit(1)

    asyncio.run(place_call(number, agent))
