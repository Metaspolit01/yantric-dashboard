# Call Recording Setup with Supabase Storage

This guide explains how call recordings work in your Yantric platform.

## Overview

Your platform now records all voice agent calls and stores them in **Supabase Storage** instead of AWS S3. The recording appears in the Call History page with an audio player for playback.

## Architecture

```
Live Call → LiveKit Records → Webhook Triggered → Dashboard API → Supabase Storage → Database Update → UI Display
```

## Components

### 1. Database Migration
File: `/workspace/supabase/migrations/20260827120000_add_call_recordings_storage.sql`

Creates:
- `call-recordings` bucket in Supabase Storage
- RLS policies for secure access (users can only access their own recordings)
- Folder structure: `{user_id}/{timestamp}_recording.webm`

### 2. LiveKit Webhook Handler
File: `/workspace/dashboard-app/src/app/api/webhooks/livekit/route.ts`

Receives `egress_ended` events from LiveKit when:
- Call ends
- Recording file is ready
- Extracts recording URL and uploads to Supabase Storage
- Updates the `calls` table with the recording URL

### 3. Call History Page
File: `/workspace/dashboard-app/src/app/dashboard/calls/page.tsx`

Displays:
- All calls with their details
- Audio player for calls with recordings
- "No recording" message for calls without recordings

## Setup Steps

### Step 1: Run the Database Migration

Go to your Supabase Dashboard → SQL Editor and run:
```sql
-- Copy contents from: /workspace/supabase/migrations/20260827120000_add_call_recordings_storage.sql
```

### Step 2: Configure Environment Variables

In your `dashboard-app/.env.local`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LiveKit webhook configuration
LIVEKIT_WEBHOOK_SECRET=your-webhook-secret  # Optional but recommended
```

In your agent `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 3: Configure LiveKit Webhook

In your LiveKit Cloud Dashboard:
1. Go to Settings → Webhooks
2. Add a new webhook endpoint: `https://your-dashboard-url.com/api/webhooks/livekit`
3. Select events to receive:
   - ✅ `egress_ended` (required for recordings)
   - ✅ `room_finished` (optional)
4. Save the webhook secret and add it to your `.env.local`

### Step 4: Enable Recording in LiveKit

For LiveKit Cloud:
1. Go to Settings → Recording
2. Enable automatic recording for all rooms
3. Set storage provider (LiveKit will temporarily store recordings before webhook picks them up)

Or programmatically in your agent (future enhancement):
```python
from livekit.api import RoomCompositeEgressRequest
# Start egress when call begins
```

### Step 5: Test the Flow

1. Start your dashboard: `cd dashboard-app && npm run dev`
2. Start your agent: `uv run python agent.py dev`
3. Make a test call from the dashboard
4. End the call
5. Check the Call History page - you should see:
   - Call entry with status "completed"
   - Audio player with the recording
   - Click play to listen

## Troubleshooting

### Recording not appearing?
1. Check LiveKit webhook logs in LiveKit Cloud Dashboard
2. Verify webhook endpoint is accessible (not localhost)
3. Check dashboard API logs for errors
4. Verify Supabase bucket exists and RLS policies are correct

### Webhook not received?
- Ensure your dashboard is deployed (webhooks can't reach localhost)
- Use ngrok for local testing: `ngrok http 3000`
- Update LiveKit webhook URL to ngrok address

### Permission denied error?
- Verify RLS policies in Supabase Storage
- Ensure `service_role` key is used (bypasses RLS)
- Check bucket name matches: `call-recordings`

### Audio player not working?
- Check browser console for CORS errors
- Verify recording URL is publicly accessible or uses signed URLs
- Ensure file format is webm/mp3/wav (supported by HTML5 audio)

## File Structure

```
/workspace/
├── supabase/migrations/
│   └── 20260827120000_add_call_recordings_storage.sql
├── dashboard-app/
│   └── src/app/
│       ├── api/webhooks/livekit/
│       │   └── route.ts              # Webhook handler
│       └── dashboard/calls/
│           └── page.tsx              # Call history with audio player
└── agent.py                          # Voice agent (recording info logged)
```

## Security Notes

- Recordings are stored in private bucket
- RLS ensures users can only access their own recordings
- Service role key used server-side only (never expose to frontend)
- Consider implementing signed URLs with expiration for additional security

## Next Steps

- Add download button for recordings
- Implement recording transcription
- Add recording analytics (listen count, etc.)
- Enable manual recording deletion
- Add recording retention policies (auto-delete after X days)
