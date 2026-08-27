import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Inbound Phone Number Routing
 *
 * GET    /api/phone-numbers — list the user's numbers with agent names
 * POST   /api/phone-numbers — map a DID to an agent for inbound answering
 *
 * The mapping is stored in Supabase; LiveKit SIP routing is configured on
 * top (see README "Inbound calls" — Vobiz DID → LiveKit inbound trunk →
 * dispatch rule targeting room `yantric-<agent_id>`).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('phone_numbers')
    .select('id, phone_number, label, provider, status, agent_id, created_at, agents(name)')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ numbers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const agentId = String(body.agentId || '');
  const label = String(body.label || '').trim().slice(0, 120) || null;

  // Normalize to +E.164 digits
  let raw = String(body.phoneNumber || '').trim();
  if (/\.0+$/.test(raw)) raw = raw.replace(/\.0+$/, '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return NextResponse.json(
      { error: 'Enter a valid phone number in international format, e.g. +919876543210.' },
      { status: 400 },
    );
  }
  const phoneNumber = `+${digits}`;

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', session.userId)
    .neq('status', 'deleted')
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const { data: number, error } = await supabase
    .from('phone_numbers')
    .insert({ user_id: session.userId, agent_id: agentId, phone_number: phoneNumber, label })
    .select()
    .single();

  if (error) {
    const conflict = error.code === '23505' || /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: conflict ? 'That number is already registered.' : error.message },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json(
    {
      number,
      note:
        'Number saved. To receive live calls, point this DID at your LiveKit inbound SIP trunk ' +
        '(Vobiz console → number routing) so it reaches room yantric-' +
        agentId +
        '. See README → Inbound calls.',
    },
    { status: 201 },
  );
}
