import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { hasValidAgentSecret, getCreditsPerMinute } from '@/lib/api-auth';

type Params = { params: Promise<{ room: string }> };

/**
 * POST /api/calls/by-room/[room]/complete
 *
 * Called by the Python voice agent when a LiveKit session ends. Finds the
 * call row by room name (works for dashboard test calls, outbound campaign
 * calls and future inbound calls) and finalizes it:
 *   - sets status / ended_at / transcript / summary / caller_phone
 *   - computes duration when the worker cannot provide one
 *   - charges credits exactly once via finalize_call_billing()
 *
 * Auth: internal agent secret (preferred) or an owner session cookie.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session && !hasValidAgentSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { room } = await params;
  const roomName = decodeURIComponent(room);
  if (!roomName.startsWith('yantric-')) {
    return NextResponse.json({ error: 'Invalid room.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const query = supabase
    .from('calls')
    .select('id, user_id, agent_id, status, started_at, duration_seconds, credits_charged')
    .eq('room_name', roomName)
    .order('started_at', { ascending: false })
    .limit(1);

  const { data: call, error } = session && !hasValidAgentSecret(req)
    ? await query.eq('user_id', session.userId).maybeSingle()
    : await query.maybeSingle();

  if (error || !call) {
    return NextResponse.json({ error: 'Call not found for this room.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  const allowed = ['status', 'transcript', 'summary', 'caller_phone', 'recording_url'] as const;
  for (const key of allowed) {
    if (typeof body[key] === 'string' && body[key].length <= 200_000) {
      updates[key] = body[key];
    }
  }
  // Only the backend may finalize a call; workers report completion.
  updates.status = typeof body.status === 'string' ? body.status : 'completed';
  updates.ended_at = new Date().toISOString();

  // Duration: trust the worker's measurement, else compute from started_at.
  let durationSeconds =
    Number.isFinite(body.duration_seconds) && body.duration_seconds >= 0
      ? Math.round(body.duration_seconds)
      : Math.max(
          0,
          Math.round((Date.now() - new Date(call.started_at as string).getTime()) / 1000),
        );
  updates.duration_seconds = durationSeconds;

  const { data: updated, error: updateError } = await supabase
    .from('calls')
    .update(updates)
    .eq('id', call.id)
    .select('id, status, duration_seconds, credits_charged')
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Update failed.' }, { status: 500 });
  }

  // Charge credits exactly once for completed calls.
  let creditsCharged = 0;
  if (updates.status === 'completed') {
    const { data: charged, error: billingError } = await supabase.rpc('finalize_call_billing', {
      p_call_id: call.id,
      p_duration_seconds: durationSeconds,
      p_credits_per_minute: getCreditsPerMinute(),
    });
    if (billingError) {
      console.error('[CompleteCall] Billing failed:', billingError.message);
    } else {
      creditsCharged = charged ?? 0;
    }
  }

  return NextResponse.json({ ok: true, callId: call.id, creditsCharged });
}
