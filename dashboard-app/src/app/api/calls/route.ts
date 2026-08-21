import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

// GET /api/calls
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agent_id');
  const limit = parseInt(searchParams.get('limit') || '50');

  const supabase = createAdminClient();
  let query = supabase
    .from('calls')
    .select(`id, status, duration_seconds, credits_used, started_at, ended_at, livekit_room, caller_identity, agents(name, business_name)`)
    .eq('user_id', session.userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (agentId) query = query.eq('agent_id', agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data });
}
