import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';

type Params = { params: Promise<{ id: string }> };

// POST /api/agents/[id]/test-session
// Creates a LiveKit room, dispatches the agent worker, and returns a token
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: agentId } = await params;
  const supabase = createAdminClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, status, user_id')
    .eq('id', agentId)
    .neq('status', 'deleted')
    .maybeSingle();

  if (error || !agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;
  const livekitUrl = process.env.LIVEKIT_URL!;
  const agentName = process.env.LIVEKIT_AGENT_NAME || 'yantric-agent';

  const roomName = `yantric-test-${agentId}-${Date.now()}`;
  const participantIdentity = `dashboard-user-${session.userId}`;
  const participantName = session.name || session.email;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '1h',
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: true,
  });

  const token = await at.toJwt();

  // Explicitly dispatch the agent worker to this room.
  // Required: Python agent has agent_name set, so it only joins on explicit dispatch.
  try {
    const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({ agent_id: agentId }),
    });
    console.log('[TestSession] Dispatched ' + agentName + ' to room ' + roomName);
  } catch (dispatchErr) {
    console.error('[TestSession] Agent dispatch error:', dispatchErr);
  }

  const { data: call } = await supabase
    .from('calls')
    .insert({
      agent_id: agentId,
      user_id: session.userId,
      room_name: roomName,
      status: 'in-progress',
      duration_seconds: 0,
      credits_used: 0,
    })
    .select('id')
    .single();

  return NextResponse.json({
    token,
    roomName,
    livekitUrl,
    agentId,
    callId: call?.id,
  });
}