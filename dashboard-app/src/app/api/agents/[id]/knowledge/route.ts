import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

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

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', session.userId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const body = await req.json();
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

  let extractedContent: string | null = null;
  let status = 'processing';
  let errorMsg = null;

  // For URLs, fetch and extract text content
  if (type === 'url' && url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Yantric-Bot/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const html = await res.text();
      // Basic HTML text extraction (strip tags)
      extractedContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50000); // Limit to 50k chars
      
      if (!extractedContent || extractedContent.length < 10) {
        throw new Error('No meaningful content extracted from URL');
      }
      
      status = 'ready';
    } catch (err) {
      errorMsg = `Failed to fetch URL: ${err instanceof Error ? err.message : 'Unknown error'}`;
      status = 'error';
      extractedContent = null;
    }
  } else if (type === 'text' && content) {
    extractedContent = content;
    status = 'ready';
  }

  const { data, error } = await supabase
    .from('knowledge_sources')
    .insert({
      agent_id: agentId,
      user_id: session.userId,
      type,
      name,
      content: extractedContent,
      url: url || null,
      status,
      error_msg: errorMsg,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data }, { status: 201 });
}
