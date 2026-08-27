import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { getCreditsPerMinute } from '@/lib/api-auth';

type Params = { params: Promise<{ id: string }> };

// GET /api/calls/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('calls')
    .select(`*, agents(name, business_name)`)
    .eq('id', id)
    .eq('user_id', session.userId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
  return NextResponse.json({ call: data });
}

// PATCH /api/calls/[id] — update call (used by webhook to mark completed)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  // This endpoint can be called by the Python agent via the internal secret
  const authHeader = req.headers.get('authorization');
  const agentSecret = process.env.YANTRIC_AGENT_API_SECRET;

  // Allow both session-authenticated users and the internal agent secret
  let authorized = false;
  const session = await getSession();
  if (session) {
    authorized = true;
  } else if (agentSecret && authHeader === `Bearer ${agentSecret}`) {
    authorized = true;
  }

  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createAdminClient();

  // Never accept arbitrary database fields from a browser request.
  const allowedFields = ['status', 'duration_seconds', 'ended_at', 'transcript', 'summary', 'caller_phone'];
  const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowedFields.includes(key)));
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid call fields supplied.' }, { status: 400 });
  }

  const updateQuery = supabase.from('calls').update(updates).eq('id', id);
  if (session) updateQuery.eq('user_id', session.userId);
  const { data, error } = await updateQuery.select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If the call was completed, bill it atomically (idempotent — never charges twice).
  if (body.status === 'completed') {
    const { error: billingError } = await supabase.rpc('finalize_call_billing', {
      p_call_id: id,
      p_duration_seconds:
        Number.isFinite(body.duration_seconds) && body.duration_seconds >= 0
          ? Math.round(body.duration_seconds)
          : null,
      p_credits_per_minute: getCreditsPerMinute(),
    });
    if (billingError) console.error('[CallPatch] Billing failed:', billingError.message);

    const { data: refreshed } = await supabase.from('calls').select('*').eq('id', id).single();
    if (refreshed) return NextResponse.json({ call: refreshed });
  }

  return NextResponse.json({ call: data });
}
