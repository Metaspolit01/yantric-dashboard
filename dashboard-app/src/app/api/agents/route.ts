import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { generateSystemPrompt, generateGreeting } from '@/lib/prompt-generator';

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
      language = 'en-IN',
      voice = 'priya',
    } = body;

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
      voice,
    });

    const greeting_message = generateGreeting({ business_name, business_description, target_users, common_questions, responsibilities, personality });

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
        credits: 100,
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
        voice,
        system_prompt,
        greeting_message,
        status: 'active',
      })
      .select()
      .single();

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
