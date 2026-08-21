import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string; sourceId: string }> };

// DELETE /api/agents/[id]/knowledge/[sourceId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: agentId, sourceId } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('knowledge_sources')
    .delete()
    .eq('id', sourceId)
    .eq('agent_id', agentId)
    .eq('user_id', session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
