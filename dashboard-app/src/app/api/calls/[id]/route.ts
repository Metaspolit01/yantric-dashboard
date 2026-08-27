import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

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

  const { data, error } = await supabase
    .from('calls')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If call ended, deduct credits from user
  if (body.status === 'completed' && body.duration_seconds) {
    const creditsPerMinute = parseInt(process.env.CREDITS_PER_MINUTE || '2');
    const minutes = Math.ceil(body.duration_seconds / 60);
    const creditsUsed = minutes * creditsPerMinute;

    // Update call credits_used
    await supabase.from('calls').update({ credits_used: creditsUsed }).eq('id', id);

    // Get user_id from call
    const { data: callData } = await supabase.from('calls').select('user_id, agent_id').eq('id', id).single();
    if (callData) {
      // Deduct credits from user profile
      await supabase.rpc('deduct_credits', { p_user_id: callData.user_id, p_amount: creditsUsed });

      // Record credit transaction
      await supabase.from('credit_transactions').insert({
        user_id: callData.user_id,
        amount: -creditsUsed,
        type: 'usage',
        description: `Call — ${minutes} minute${minutes !== 1 ? 's' : ''}`,
        call_id: id,
      });

      // Update agent totals
      await supabase.from('agents').update({
        total_calls: supabase.rpc as unknown as number,
      }).eq('id', callData.agent_id);
    }
  }

  return NextResponse.json({ call: data });
}
