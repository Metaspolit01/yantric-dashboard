import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { generateSystemPrompt, generateGreeting } from '@/lib/prompt-generator';
import { sanitizeLanguages } from '@/lib/languages';
import { translateGreeting } from '@/lib/translate';

// GET /api/agents — list all agents for the authenticated user
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, business_name, status, total_calls, total_minutes, total_credits_used, created_at, language, voice')
    .eq('user_id', session.userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

// POST /api/agents — create a new agent
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      name,
      business_name,
      business_description,
      target_users,
      common_questions,
      responsibilities,
      personality,
      voice = 'priya',
    } = body;

    // Multi-language support: sanitize to Sarvam-TTS-supported codes;
    // primary language = first selection (backward-compatible `language`).
    const languages = sanitizeLanguages(body.languages).length > 0
      ? sanitizeLanguages(body.languages)
      : sanitizeLanguages([body.language]);
    const language = languages[0] || 'en-IN';

    if (!name || !business_name || !business_description || !target_users || !common_questions || !responsibilities || !personality) {
      return NextResponse.json({ error: 'All 5 business questions are required.' }, { status: 400 });
    }

    // Generate the system prompt dynamically
    const system_prompt = generateSystemPrompt({
      business_name,
      business_description,
      target_users,
      common_questions,
      responsibilities,
      personality,
      language,
      languages,
      voice,
    });

    const greeting_message = generateGreeting({ business_name, business_description, target_users, common_questions, responsibilities, personality, language, languages });

    // Non-English primary language → convert the greeting so the agent
    // greets in that language (natural code-mixed style).
    const greeting_spoken = language !== 'en-IN'
      ? (await translateGreeting(greeting_message, language)) ?? ''
      : '';

    const supabase = createAdminClient();

    // Ensure user profile exists in public.profiles for foreign key constraint
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: session.userId,
        email: session.email,
        name: session.name || session.email.split('@')[0],
        credits: 0,
        plan: 'free',
      });
    }

    const { data, error } = await supabase
      .from('agents')
      .insert({
        user_id: session.userId,
        name,
        business_name,
        business_description,
        target_users,
        common_questions,
        responsibilities,
        personality,
        language,
        languages,
        voice,
        system_prompt,
        greeting_message,
        greeting_spoken,
        status: 'active',
      })
      .select()
      .single();

    // Schema drift fallback: if the multi-language columns are not migrated
    // yet, create the agent with the legacy columns instead of failing.
    if (error && /column.*(does not exist|could not find)/i.test(error.message)) {
      console.warn('[CreateAgent] Multi-language columns missing — falling back to legacy insert.');
      const { data: legacyData, error: legacyError } = await supabase
        .from('agents')
        .insert({
          user_id: session.userId,
          name,
          business_name,
          business_description,
          target_users,
          common_questions,
          responsibilities,
          personality,
          language,
          voice,
          system_prompt,
          greeting_message,
          status: 'active',
        })
        .select()
        .single();
      if (legacyError) {
        console.error('Database legacy insert agent error:', legacyError);
        return NextResponse.json({ error: legacyError.message }, { status: 500 });
      }
      return NextResponse.json({ agent: legacyData }, { status: 201 });
    }

    if (error) {
      console.error('Database insert agent error:', error);
      if (error.message.includes('schema cache') || error.code === 'PGRST205') {
        return NextResponse.json({
          error: "Database table 'agents' missing. Please run scratch/supabase_schema.sql in your Supabase SQL Editor."
        }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ agent: data }, { status: 201 });

  } catch (err) {
    console.error('Create agent error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
