import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string }> };

// GET /api/campaigns/[id] — campaign detail with contact-level status
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: campaign, error } = await supabase
    .from('outbound_campaigns')
    .select('*, agents(name)')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  const { data: contacts } = await supabase
    .from('campaign_contacts')
    .select('id, phone, name, status, attempts, last_error, call_id, updated_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })
    .limit(500);

  return NextResponse.json({ campaign, contacts: contacts ?? [] });
}

// PATCH /api/campaigns/[id] — pause or resume a queued/running campaign
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nextStatus = body.status;

  if (!['paused', 'running'].includes(nextStatus)) {
    return NextResponse.json({ error: "status must be 'paused' or 'running'." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from('outbound_campaigns')
    .select('status')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  if (!['queued', 'running', 'paused'].includes(current.status)) {
    return NextResponse.json(
      { error: `A ${current.status} campaign cannot be paused/resumed.` },
      { status: 409 },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('outbound_campaigns')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.userId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ campaign: updated });
}

// DELETE /api/campaigns/[id] — remove a campaign (contacts cascade)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('outbound_campaigns')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
