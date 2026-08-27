import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agent-config/[id]
 *
 * This endpoint is called by the Python LiveKit agent at runtime to fetch
 * dynamic configuration for a specific agent_id.
 *
 * It is secured with the YANTRIC_AGENT_API_SECRET environment variable.
 * The Python agent must include: Authorization: Bearer <YANTRIC_AGENT_API_SECRET>
 *
 * Returns the full agent config including system prompt, STT/TTS settings, and greeting.
 */
export async function GET(req: NextRequest, { params }: Params) {
  // Verify internal agent secret
  const authHeader = req.headers.get('authorization');
  const agentSecret = process.env.YANTRIC_AGENT_API_SECRET;

  if (!agentSecret || authHeader !== `Bearer ${agentSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: agentId } = await params;
  const supabase = createAdminClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, business_name, system_prompt, greeting_message, language, voice, llm_model, status')
    .eq('id', agentId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  if (agent.status === 'deleted') {
    return NextResponse.json({ error: 'Agent has been deleted.' }, { status: 403 });
  }

  // Also fetch knowledge sources content to inject as context
  const { data: sources } = await supabase
    .from('knowledge_sources')
    .select('type, name, content, url')
    .eq('agent_id', agentId)
    .eq('status', 'ready');

  let knowledgeContext = '';
  if (sources && sources.length > 0) {
    knowledgeContext = '\n\nBUSINESS KNOWLEDGE BASE:\n';
    for (const src of sources) {
      knowledgeContext += `\n--- ${src.name} ---\n${src.content?.slice(0, 5000) || ''}\n`;
    }
  }

  const fullSystemPrompt = agent.system_prompt + knowledgeContext;

  const validSpeakers = [
    'shubh', 'ritu', 'rahul', 'pooja', 'simran', 'kavya', 'amit', 'ratan',
    'rohan', 'dev', 'ishita', 'shreya', 'manan', 'sumit', 'priya', 'aditya',
    'kabir', 'neha', 'varun', 'roopa', 'aayan', 'ashutosh', 'advait', 'amelia',
    'sophia', 'suhani', 'rupali', 'tanya', 'shruti', 'kavitha'
  ];
  const speakerMap: Record<string, string> = { arjun: 'shubh', meera: 'priya' };
  const s = (agent.voice || '').toLowerCase().trim();
  const safeSpeaker = validSpeakers.includes(s) ? s : (speakerMap[s] || 'priya');

  // Handle both single language and multiple languages
  const primaryLanguage = agent.language || 'en-IN';
  const languagesArray = Array.isArray(agent.languages) && agent.languages.length > 0 
    ? agent.languages 
    : [primaryLanguage];

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    business_name: agent.business_name,
    system_prompt: fullSystemPrompt,
    greeting_message: agent.greeting_message,
    language: primaryLanguage,        // e.g. "en-IN", "te-IN", "hi-IN"
    languages: languagesArray,        // Array of supported languages e.g. ["en-IN", "te-IN"]
    voice: agent.voice,              // e.g. "priya", "shubh"
    llm_model: agent.llm_model,      // e.g. "google/gemma-4-31b-it"
    stt_language: primaryLanguage,
    tts_language: primaryLanguage,
    tts_speaker: safeSpeaker,
  });
}
