import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { cleanText, embedTexts, getEmbeddingConfig, isRagEnabled } from '@/lib/knowledge-pipeline';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/agents/[id]/knowledge/search
 *
 * Internal retrieval endpoint for the Python voice agent (RAG).
 * Embeds the query and returns the most relevant knowledge chunks.
 *
 * Auth: Authorization: Bearer <YANTRIC_AGENT_API_SECRET>
 *       (same shared secret as /api/agent-config/[id])
 *
 * Body:  { "query": "clinic timings", "top_k": 5 }   (top_k optional, default 5)
 * Returns: { results: [{ content, source_name, similarity }] }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const authHeader = req.headers.get('authorization');
  const agentSecret = process.env.YANTRIC_AGENT_API_SECRET;
  if (!agentSecret || authHeader !== `Bearer ${agentSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = getEmbeddingConfig();
  if (!isRagEnabled(cfg)) {
    return NextResponse.json({ error: 'Embeddings are not configured.' }, { status: 503 });
  }

  const { id: agentId } = await params;

  let body: { query?: unknown; top_k?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const query = cleanText(typeof body.query === 'string' ? body.query : '');
  if (!query || query.length > 512) {
    return NextResponse.json({ error: 'query is required (max 512 characters).' }, { status: 400 });
  }

  const matchCount = Math.min(
    Math.max(parseInt(String(body.top_k ?? '5'), 10) || 5, 1),
    20,
  );

  const supabase = createAdminClient();

  // Guard: only serve search for agents that exist and aren't deleted.
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .neq('status', 'deleted')
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  let vector: number[];
  try {
    [vector] = await embedTexts([query], 'RETRIEVAL_QUERY', cfg);
  } catch (err) {
    console.error('[KnowledgeSearch] Query embedding failed:', err);
    return NextResponse.json({ error: 'Failed to embed query.' }, { status: 502 });
  }

  // pgvector expects a '[0.1,0.2,...]' literal; supabase-js would serialize a
  // number array as a Postgres `{...}` array which vector columns reject.
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    p_agent_id: agentId,
    p_query_embedding: `[${vector.join(',')}]`,
    p_match_count: matchCount,
    p_min_similarity: 0.25,
  });

  if (error) {
    console.error('[KnowledgeSearch] Similarity search failed:', error.message);
    return NextResponse.json({ error: 'Knowledge search failed.' }, { status: 500 });
  }

  const results = ((data ?? []) as Array<{ content: string; source_name: string; similarity: number }>).map(
    (r) => ({ content: r.content, source_name: r.source_name, similarity: r.similarity }),
  );

  return NextResponse.json({ results });
}
