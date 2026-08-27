import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { hasValidAgentSecret } from '@/lib/api-auth';

/**
 * POST /api/dialer/result — internal endpoint for the Python worker.
 *
 * Reports the outcome of placing an outbound call. The actual call duration/
 * transcript/billing still flows through /api/calls/by-room/[room]/complete
 * when the LiveKit session ends; this only updates contact + campaign state.
 *
 * Body: { contactId, success, error?, outcome?: 'no_answer' | 'failed' }
 */
export async function POST(req: NextRequest) {
  if (!hasValidAgentSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contactId = body.contactId;
  const success = body.success === true;
  const outcome = success ? 'completed' : body.outcome === 'no_answer' ? 'no_answer' : 'failed';

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: contact, error: updateError } = await supabase
    .from('campaign_contacts')
    .update({
      status: outcome,
      last_error: success ? null : String(body.error || 'Call failed').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .select('id, campaign_id')
    .single();

  if (updateError || !contact) {
    return NextResponse.json({ error: updateError?.message ?? 'Contact not found.' }, { status: 404 });
  }

  await supabase
    .from('outbound_campaigns')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', contact.campaign_id);

  return NextResponse.json({ ok: true, status: outcome });
}
