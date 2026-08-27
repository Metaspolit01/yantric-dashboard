import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { generateSystemPrompt } from '@/lib/prompt-generator';

type Params = { params: Promise<{ id: string }> };

// GET /api/agents/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .neq('status', 'deleted')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  return NextResponse.json({ agent: data });
}

// PATCH /api/agents/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  // If core config changed, regenerate system prompt
  const promptFields = ['business_description', 'target_users', 'common_questions', 'responsibilities', 'personality', 'business_name'];
  const needsRegeneration = promptFields.some(f => f in body);

  let updates = { ...body };

  if (needsRegeneration) {
    // Fetch existing to merge
    const { data: existing } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .neq('status', 'deleted')
      .single();

    if (!existing) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

    const merged = { ...existing, ...body };
    updates.system_prompt = generateSystemPrompt(merged);
  }

  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync to root prompts/assistant_prompt.txt
  if (data?.system_prompt) {
    try {
      const fs = require('fs');
      const path = require('path');
      const rootPromptPath = path.join(process.cwd(), '..', 'prompts', 'assistant_prompt.txt');
      fs.writeFileSync(rootPromptPath, data.system_prompt, 'utf-8');
    } catch (e) {
      console.warn('Could not write to root prompts/assistant_prompt.txt:', e);
    }
  }

  return NextResponse.json({ agent: data });
}

// DELETE /api/agents/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('agents')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
