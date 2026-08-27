import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/[id]/start — queue a campaign for the dialer worker.
 *
 * Guards (spec §19): agent must be active and the account must hold credits.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, status, total_contacts')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  if (!['draft', 'paused'].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Campaign is already ${campaign.status}.` },
      { status: 409 },
    );
  }
  if (campaign.total_contacts === 0) {
    return NextResponse.json({ error: 'This campaign has no contacts.' }, { status: 400 });
  }

  // Low-credit guard: dialing burns minutes; require at least one minute's worth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', session.userId)
    .single();
  if (!profile || profile.credits <= 0) {
    return NextResponse.json(
      { error: 'You are out of credits. Buy a credit pack to run campaigns.', needsCredits: true },
      { status: 402 },
    );
  }

  const { data: updated, error } = await supabase
    .from('outbound_campaigns')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: updated });
}
