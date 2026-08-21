#!/usr/bin/env python3
"""
Trigger an outbound Twilio phone call and dispatch your LiveKit voice agent to the room.

Usage:
    1. Make sure your agent worker is running in terminal 1:
       uv run python agent.py dev

    2. Trigger the phone call in terminal 2:
       uv run python make_call.py
"""

import asyncio
import os
import sys
from dotenv import load_dotenv
from livekit.api import LiveKitAPI
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest

load_dotenv(".env")

from agent import _get_twilio_connect_url, _place_twilio_outbound_call_sync

async def place_call():
    to_number = os.getenv("TWILIO_TO_NUMBER")
    from_number = os.getenv("TWILIO_FROM_NUMBER")
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "HR-agent")
    room_name = os.getenv("LIVEKIT_ROOM_NAME", f"demo-call-{os.urandom(4).hex()}")

    if not to_number or not from_number:
        print("❌ Error: Missing TWILIO_TO_NUMBER or TWILIO_FROM_NUMBER in .env")
        sys.exit(1)

    print(f"📞 Initiating outbound call via Twilio...")
    print(f"   From:  {from_number}")
    print(f"   To:    {to_number}")
    print(f"   Agent: {agent_name}")
    print(f"   Room:  {room_name}")

    try:
        # Step 1: Dispatch the agent worker to this room
        print(f"1. Dispatching agent '{agent_name}' to room '{room_name}'...")
        async with LiveKitAPI() as livekit_api:
            await livekit_api.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    agent_name=agent_name,
                    room=room_name,
                )
            )
        print("   Agent dispatched successfully!")

        # Step 2: Get Twilio stream connection URL for LiveKit room
        print("2. Generating LiveKit Twilio stream URL...")
        connect_url = await _get_twilio_connect_url(room_name)

        # Step 3: Trigger Twilio outbound REST API call
        print("3. Dialing phone via Twilio...")
        result = _place_twilio_outbound_call_sync(connect_url)
        call_sid = result.get("sid", "Unknown")
        status = result.get("status", "Unknown")
        
        print(f"\n✅ Call queued successfully!")
        print(f"   Twilio Call SID: {call_sid}")
        print(f"   Status: {status}")
        print(f"\n📲 Your phone ({to_number}) will ring in a few seconds.")
        print("👉 IMPORTANT: Answer the call and PRESS 1 on your phone keypad to connect to the AI Agent!")

    except Exception as e:
        print(f"❌ Call placement failed: {e}")

if __name__ == "__main__":
    asyncio.run(place_call())
