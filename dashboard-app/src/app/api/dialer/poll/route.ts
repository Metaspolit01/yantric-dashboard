import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { hasValidAgentSecret } from '@/lib/api-auth';

/**
 * POST /api/dialer/poll — internal endpoint for the Python worker.
 *
 * Atomically claims the next pending campaign contact and hands the worker
 * everything needed to place the call:
 *
 *   { job: { contactId, campaignId, agentId, phone, name, roomName, callId } }
 *   or { job: null }
 *
 * Room convention `yantric-<agent_id>-out-<contact_id>` keeps
 * extract_agent_id_from_room() working unchanged on the worker side.
 *
 * Concurrency note: designed for ONE dialer worker (Yantric architecture).
 */
export async function POST(req: NextRequest) {
  if (!hasValidAgentSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── Housekeeping: finish campaigns with nothing left to dial ──────────────
  const { data: activeCampaigns } = await supabase
    .from('outbound_campaigns')
    .select('id')
    .in('status', ['queued', 'running']);

  for (const c of activeCampaigns ?? []) {
    const { count } = await supabase
      .from('campaign_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', c.id)
      .in('status', ['pending', 'calling']);
    // Calling contacts stuck from a crashed worker older than 30 min are re-dialable? Keep simple:
    // only mark completed when nothing pending/calling remains.
    if (count === 0) {
      await supabase
        .from('outbound_campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', c.id)
        .neq('status', 'completed');
    }
  }

  // ── Claim the next pending contact (oldest queued/running campaign first) ─
  const { data: campaigns } = await supabase
    .from('outbound_campaigns')
    .select('id, agent_id, from_number')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: true })
    .limit(10);

  for (const campaign of campaigns ?? []) {
    const { data: contact } = await supabase
      .from('campaign_contacts')
      .select('id, user_id, agent_id, phone, name, attempts')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!contact) continue;

    const roomName = `yantric-${contact.agent_id}-out-${contact.id}`;

    // Pre-create the call record so completion reporting finds it by room.
    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert({
        agent_id: contact.agent_id,
        user_id: contact.user_id,
        room_name: roomName,
        direction: 'outbound',
        caller_phone: contact.phone,
        status: 'in-progress',
      })
      .select('id')
      .single();
    if (callError || !call) continue;

    const { error: claimError } = await supabase
      .from('campaign_contacts')
      .update({
        status: 'calling',
        attempts: (contact.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)
      .eq('status', 'pending'); // claim guard

    if (claimError) {
      await supabase.from('calls').delete().eq('id', call.id);
      continue;
    }

    return NextResponse.json({
      job: {
        contactId: contact.id,
        campaignId: campaign.id,
        agentId: contact.agent_id,
        userId: contact.user_id,
        phone: contact.phone,
        name: contact.name,
        roomName,
        callId: call.id,
        fromNumber: campaign.from_number,
      },
    });
  }

  return NextResponse.json({ job: null });
}
