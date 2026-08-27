import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { getEmbeddingConfig, isRagEnabled, ingestKnowledgeSource } from '@/lib/knowledge-pipeline';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Extracts text in memory only. The original customer document is never stored by this route. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: agentId } = await params;
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('agents').select('id').eq('id', agentId).eq('user_id', session.userId).maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the upload. Please try again.' }, { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Upload a valid PDF file.' }, { status: 400 });
  }
  if (file.size === 0 || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF files must be between 1 byte and 10 MB.' }, { status: 400 });
  }

  try {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(Buffer.from(await file.arrayBuffer()));
    const content = parsed.text.replace(/\s+/g, ' ').trim().slice(0, 50000);
    if (!content) return NextResponse.json({ error: 'No readable text was found in this PDF.' }, { status: 422 });

    const rag = isRagEnabled(getEmbeddingConfig());
    const { data: source, error } = await supabase.from('knowledge_sources').insert({
      agent_id: agentId,
      user_id: session.userId,
      type: 'pdf',
      name: file.name,
      content,
      file_size: file.size,
      status: rag ? 'processing' : 'ready',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (rag) {
      const result = await ingestKnowledgeSource(supabase, {
        id: source.id,
        agent_id: agentId,
        user_id: session.userId,
        content,
      });
      const { data: refreshed } = await supabase
        .from('knowledge_sources').select('*').eq('id', source.id).single();
      return NextResponse.json(
        { source: refreshed ?? source, indexed: result.ok, chunkCount: result.chunkCount, error: result.error },
        { status: 201 },
      );
    }

    return NextResponse.json({ source, indexed: false }, { status: 201 });
  } catch (error) {
    console.error('PDF extraction failed:', error);
    return NextResponse.json({ error: 'We could not read that PDF. Try a text-based PDF instead.' }, { status: 422 });
  }
}
