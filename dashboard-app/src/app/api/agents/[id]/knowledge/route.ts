import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  getEmbeddingConfig,
  isRagEnabled,
  ingestKnowledgeSource,
  fetchWebPageText,
  normalizeUrl,
} from '@/lib/knowledge-pipeline';

type Params = { params: Promise<{ id: string }> };

// GET /api/agents/[id]/knowledge
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: agentId } = await params;
  const supabase = createAdminClient();

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', session.userId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const { data, error } = await supabase
    .from('knowledge_sources')
    .select('id, type, name, url, status, error_msg, created_at, file_size')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data });
}

// POST /api/agents/[id]/knowledge — add a knowledge source
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: agentId } = await params;
  const supabase = createAdminClient();

  try {
    return await handleAddSource(req, supabase, session.userId, agentId);
  } catch (err) {
    // Never let the browser see a raw connection error.
    console.error('[Knowledge] Add source failed:', err);
    return NextResponse.json(
      { error: 'Something went wrong while adding this source. Please try again.' },
      { status: 500 },
    );
  }
}

async function handleAddSource(
  req: NextRequest,
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  agentId: string,
) {
  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const { type, name, content, url } = body;

  if (!type || !name) {
    return NextResponse.json({ error: 'type and name are required.' }, { status: 400 });
  }

  if (type === 'url' && !url) {
    return NextResponse.json({ error: 'URL is required for type=url.' }, { status: 400 });
  }

  if (type === 'text' && !content) {
    return NextResponse.json({ error: 'content is required for type=text.' }, { status: 400 });
  }

  let extractedContent = content || null;
  let errorMsg: string | null = null;
  let normalizedUrl: string | null = url || null;

  // For URLs: normalise (adds https:// when missing), fetch and extract
  // readable text. Every failure produces a friendly, actionable message.
  if (type === 'url' && url) {
    try {
      normalizedUrl = normalizeUrl(url);
      extractedContent = await fetchWebPageText(url);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Could not read that website.';
      extractedContent = null;
    }
  }

  // When RAG is configured, the source is indexed (chunk → embed → store);
  // otherwise it stays in legacy mode and the content is prompt-truncated.
  const rag = isRagEnabled(getEmbeddingConfig());
  const initialStatus = errorMsg ? 'error' : rag ? 'processing' : 'ready';

  const { data: source, error } = await supabase
    .from('knowledge_sources')
    .insert({
      agent_id: agentId,
      user_id: userId,
      type,
      name,
      content: extractedContent,
      url: normalizedUrl,
      status: initialStatus,
      error_msg: errorMsg,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (rag && !errorMsg && extractedContent) {
    const result = await ingestKnowledgeSource(supabase, {
      id: source.id,
      agent_id: agentId,
      user_id: userId,
      content: extractedContent,
    });
    const { data: refreshed } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', source.id)
      .single();
    return NextResponse.json(
      { source: refreshed ?? source, indexed: result.ok, chunkCount: result.chunkCount, error: result.error },
      { status: 201 },
    );
  }

  return NextResponse.json({ source, indexed: false }, { status: 201 });
}
