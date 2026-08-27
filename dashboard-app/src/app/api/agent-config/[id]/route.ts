import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildLanguageRules } from '@/lib/prompt-generator';

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

  // Prefer the multi-language schema; degrade gracefully when the new
  // columns (languages / greeting_spoken) are not migrated yet, so the
  // worker NEVER falls back to its default English prompt over schema drift.
  let selectFields =
    'id, name, business_name, system_prompt, greeting_message, greeting_spoken, language, languages, voice, llm_model, status';
  let { data: agent, error } = await supabase
    .from('agents')
    .select(selectFields)
    .eq('id', agentId)
    .single();

  if (error) {
    selectFields =
      'id, name, business_name, system_prompt, greeting_message, language, voice, llm_model, status';
    ({ data: agent, error } = await supabase
      .from('agents')
      .select(selectFields)
      .eq('id', agentId)
      .single());
  }

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  if (agent.status === 'deleted') {
    return NextResponse.json({ error: 'Agent has been deleted.' }, { status: 403 });
  }

  // ── Knowledge handling ───────────────────────────────────────────────────
  // RAG mode: if embedded chunks exist for this agent, the runtime retrieves
  // relevant facts during the conversation via the search_knowledge tool
  // (/api/agents/[id]/knowledge/search). The prompt only lists document names.
  //
  // Legacy fallback: when no chunks exist yet (embeddings not configured or
  // sources uploaded before RAG), keep the old behaviour of truncating each
  // source into the prompt so agents never lose their knowledge entirely.
  const { data: readySources } = await supabase
    .from('knowledge_sources')
    .select('name, type, content')
    .eq('agent_id', agentId)
    .eq('status', 'ready');

  const { data: chunkProbe } = await supabase
    .from('knowledge_chunks')
    .select('id')
    .eq('agent_id', agentId)
    .limit(1);

  const kbEnabled = !!chunkProbe && chunkProbe.length > 0;

  let fullSystemPrompt = agent.system_prompt;

  if (kbEnabled) {
    const docNames = (readySources ?? []).map((s) => s.name).join('; ');
    fullSystemPrompt +=
      '\n\nKNOWLEDGE BASE:\n' +
      (docNames ? `Available business documents: ${docNames}.\n` : '') +
      'When you need specific business details (prices, timings, address, policies, services), ' +
      'call the search_knowledge tool with a short query before answering. ' +
      'Use only facts found in the results. If nothing relevant is found, say you are not ' +
      'sure and offer to help another way.';
  } else if (readySources && readySources.length > 0) {
    let knowledgeContext = '\n\nBUSINESS KNOWLEDGE BASE:\n';
    for (const src of readySources) {
      knowledgeContext += `\n--- ${src.name} ---\n${src.content?.slice(0, 5000) || ''}\n`;
    }
    fullSystemPrompt += knowledgeContext;
  }

  // Multi-language: STT auto-detects the caller's language; TTS defaults to
  // the primary language and switches per reply via the <lang:xx-XX> tags
  // the system prompt instructs the LLM to emit.
  const languages: string[] = Array.isArray(agent.languages) && agent.languages.length > 0
    ? agent.languages
    : [agent.language || 'en-IN'];
  const primary = languages[0] || agent.language || 'en-IN';

  // The greeting the agent SPEAKS: prefer the primary-language conversion so
  // an English-typed greeting is still voiced in Telugu/Hindi/etc.
  let greetingOut = (agent.greeting_spoken || '').trim() || (agent.greeting_message || '').trim();
  if (languages.length > 1 && greetingOut && !greetingOut.startsWith('<lang:')) {
    greetingOut = `<lang:${primary}> ${greetingOut}`;
  }

  // Language rules are injected at RUNTIME (never stored in the DB prompt) so
  // improvements — native script, English code-mixing, natural pauses — apply
  // to every existing agent immediately, without re-saving (spec §13).
  fullSystemPrompt += '\n\n' + buildLanguageRules({ language: primary, languages });

  const validSpeakers = [
    'shubh', 'ritu', 'rahul', 'pooja', 'simran', 'kavya', 'amit', 'ratan',
    'rohan', 'dev', 'ishita', 'shreya', 'manan', 'sumit', 'priya', 'aditya',
    'kabir', 'neha', 'varun', 'roopa', 'aayan', 'ashutosh', 'advait', 'amelia',
    'sophia', 'suhani', 'rupali', 'tanya', 'shruti', 'kavitha'
  ];
  const speakerMap: Record<string, string> = { arjun: 'shubh', meera: 'priya' };
  const s = (agent.voice || '').toLowerCase().trim();
  const safeSpeaker = validSpeakers.includes(s) ? s : (speakerMap[s] || 'priya');

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    business_name: agent.business_name,
    system_prompt: fullSystemPrompt,
    greeting_message: greetingOut,
    language: primary,               // primary language, e.g. "te-IN"
    languages,                       // all spoken languages, primary first
    voice: agent.voice,              // e.g. "priya", "shubh"
    llm_model: agent.llm_model,      // e.g. "google/gemma-4-31b-it"
    kb_enabled: kbEnabled,           // true → runtime registers the search_knowledge tool
    stt_language: languages.length > 1 ? 'unknown' : primary,
    tts_language: primary,
    tts_speaker: safeSpeaker,
  });
}
