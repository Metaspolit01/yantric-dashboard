import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { generateSystemPrompt, generateGreeting } from '@/lib/prompt-generator';
import { sanitizeLanguages } from '@/lib/languages';
import { translateGreeting } from '@/lib/translate';

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
    .eq('user_id', session.userId)
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

  // Only these fields may be written from the browser (never trust the client
  // with system_prompt, ownership, or usage counters — spec §22/§35).
  const EDITABLE_FIELDS = [
    'name', 'business_name', 'business_description', 'target_users',
    'common_questions', 'responsibilities', 'personality',
    'greeting_message', 'language', 'languages', 'voice', 'llm_model', 'status',
  ] as const;
  const updates: Record<string, unknown> = Object.fromEntries(
    Object.entries(body ?? {}).filter(([k]) => (EDITABLE_FIELDS as readonly string[]).includes(k)),
  );

  // Multi-language: sanitize list; primary = first entry
  if ('languages' in updates) {
    const langs = sanitizeLanguages(updates.languages);
    if (langs.length === 0) {
      return NextResponse.json({ error: 'Select at least one language.' }, { status: 400 });
    }
    updates.languages = langs;
    if (!('language' in updates)) updates.language = langs[0];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  // If core config changed, regenerate system prompt
  const promptFields = ['business_description', 'target_users', 'common_questions', 'responsibilities', 'personality', 'business_name', 'language', 'languages'];
  const needsRegeneration = promptFields.some(f => f in updates);

  if (needsRegeneration) {
    // Fetch existing to merge
    const { data: existing } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.userId)
      .neq('status', 'deleted')
      .single();

    if (!existing) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

    const merged = { ...existing, ...updates };
    updates.system_prompt = generateSystemPrompt(merged);

    // Keep the auto-greeting in sync with the business (only when the user
    // has not written a custom greeting).
    if (!('greeting_message' in updates)) {
      const currentGreeting = (existing.greeting_message || '').trim();
      if (currentGreeting === generateGreeting(existing).trim()) {
        updates.greeting_message = generateGreeting(merged);
      }
    }
  }

  // Greeting must be spoken in the agent's PRIMARY language: re-translate
  // whenever the greeting text or the primary language changes.
  if ('greeting_message' in updates || 'language' in updates || 'languages' in updates) {
    const { data: current } = await supabase
      .from('agents')
      .select('language, greeting_message')
      .eq('id', id)
      .eq('user_id', session.userId)
      .maybeSingle();

    const finalGreeting = String(
      ('greeting_message' in updates ? updates.greeting_message : current?.greeting_message) || '',
    ).trim();
    const finalPrimary = String(
      ('language' in updates ? updates.language : current?.language) || 'en-IN',
    );

    if (finalPrimary !== 'en-IN' && finalGreeting) {
      const translated = await translateGreeting(finalGreeting, finalPrimary);
      updates.greeting_spoken = translated ?? '';
    } else {
      updates.greeting_spoken = '';
    }
  }

  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.userId)
    .select()
    .single();

  // Schema drift fallback: retry without multi-language columns when the
  // database is not migrated yet, so saving never hard-fails.
  if (error && /column.*(does not exist|could not find)/i.test(error.message)) {
    console.warn('[UpdateAgent] Multi-language columns missing — retrying legacy update.');
    const legacy = { ...updates } as Record<string, unknown>;
    delete legacy.languages;
    delete legacy.greeting_spoken;
    const { data: legacyData, error: legacyError } = await supabase
      .from('agents')
      .update(legacy)
      .eq('id', id)
      .eq('user_id', session.userId)
      .select()
      .single();
    if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
    return NextResponse.json({ agent: legacyData });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
