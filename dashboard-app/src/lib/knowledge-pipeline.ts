import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Yantric Knowledge Pipeline
 *
 * Turns raw business knowledge (PDF text / website text / plain text) into
 * embedded chunks for retrieval-augmented generation (RAG):
 *
 *   extract (routes) → clean → chunk → embed → store → retrieve (search API)
 *
 * Embeddings use Google `gemini-embedding-001` (768 dims) via env config.
 * If embeddings are not configured, callers fall back to legacy behaviour
 * (knowledge truncated directly into the system prompt) so nothing breaks.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  provider: 'google' | 'none';
  apiKey: string;
  model: string;
  dim: number;
}

const PLACEHOLDER_KEY_PATTERNS = /^paste[-_]|^your[-_]|^xxx|^replace[-_]/i;

export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey =
    process.env.GOOGLE_AI_API_KEY || '';
  const enabled = (process.env.EMBEDDING_PROVIDER || '').toLowerCase() === 'google';

  // A non-empty but PLACEHOLDER key (e.g. "PASTE-YOUR-KEY") must not put the
  // pipeline into RAG mode — uploads would otherwise fail with confusing
  // embedding errors instead of working in legacy mode.
  if (enabled && apiKey && !PLACEHOLDER_KEY_PATTERNS.test(apiKey)) {
    return {
      provider: 'google',
      apiKey,
      model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
      dim: parseInt(process.env.EMBEDDING_DIM || '768', 10),
    };
  }
  return { provider: 'none', apiKey: '', model: '', dim: 0 };
}

/** True when the platform can run the full chunk → embed → store pipeline. */
export function isRagEnabled(cfg: EmbeddingConfig = getEmbeddingConfig()): boolean {
  return cfg.provider === 'google' && !!cfg.apiKey;
}

// ─── Web page fetching ──────────────────────────────────────────────────────

/**
 * Normalises user-typed URLs: adds https:// when the scheme is missing,
 * validates, and rejects anything that is not a public http(s) address.
 * Throws an Error with a user-friendly message on invalid input.
 */
export function normalizeUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) throw new Error('Enter a website address.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new Error(`"${raw.trim()}" is not a valid website address.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https websites are supported.');
  }
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    throw new Error(`"${parsed.hostname}" does not look like a real website address.`);
  }
  return parsed.toString();
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&#x27;': "'", '&#x2F;': '/',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? ' ');
}

const MAX_PAGE_BYTES = 2_000_000; // don't pull huge pages into memory

/**
 * Fetches a web page and extracts readable business text (server-side).
 * Friendly, actionable errors — these surface directly in the dashboard.
 */
export async function fetchWebPageText(rawUrl: string): Promise<string> {
  const url = normalizeUrl(rawUrl);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; YantricBot/1.0; +https://yantric.ai) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout|abort/i.test(msg)) {
      throw new Error('That website took too long to respond. Try again or use another page.');
    }
    throw new Error(`Could not reach "${url}". Check the address and your internet connection.`);
  }

  if (res.status === 403 || res.status === 401) {
    throw new Error('That website refused automated access. Try a different page, or paste its text instead.');
  }
  if (res.status === 404) {
    throw new Error('That page was not found (404). Double-check the address.');
  }
  if (!res.ok) {
    throw new Error(`That website responded with error ${res.status}. Try another page.`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!/text\/html|text\/plain|xhtml/i.test(contentType)) {
    throw new Error('That address is not a regular web page (PDFs and other files are not supported for URLs).');
  }

  const rawHtml = (await res.text()).slice(0, MAX_PAGE_BYTES);
  const extracted = extractHtmlText(rawHtml);
  if (!extracted || extracted.length < 80) {
    throw new Error('No readable text found on that page (it may be built entirely with JavaScript). Try pasting the text instead.');
  }
  return extracted;
}

/** Strips scripts/styles/markup and keeps readable content, title first. */
export function extractHtmlText(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);

  let body = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(noscript|svg|iframe|form|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Prefer main/article content when present
  const main = body.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2] && main[2].replace(/<[^>]+>/g, ' ').trim().length > 200) {
    body = main[2];
  }

  // Block tags become paragraph breaks so sentences don't fuse together
  const text = decodeHtmlEntities(
    body
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  const metaParts: string[] = [];
  if (titleMatch?.[1]) metaParts.push(decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim());
  if (descMatch?.[1]) metaParts.push(decodeHtmlEntities(descMatch[1]).replace(/\s+/g, ' ').trim());

  const combined = [...metaParts, text].filter(Boolean).join('\n\n');
  return cleanText(combined).slice(0, 50_000);
}

// ─── Text preparation ───────────────────────────────────────────────────────

export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Splits on sentence ends including the Devanagari danda (।) for Hindi text. */
const SENTENCE_BOUNDARY = /(?<=[.!?।])\s+/;

function hardSplit(sentence: string, maxLen: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < sentence.length; i += maxLen) {
    parts.push(sentence.slice(i, i + maxLen));
  }
  return parts;
}

function wordBoundaryTail(text: string, overlap: number): string {
  if (text.length <= overlap) return text;
  let tail = text.slice(text.length - overlap);
  // Drop the partial word at the start of the tail so it reads cleanly.
  const trimmed = tail.replace(/^\S+\s+/, '');
  return trimmed || tail;
}

/**
 * Chunks text into overlapping, sentence-aligned pieces.
 * Defaults (~800 chars, ~120 overlap) keep every chunk well inside the
 * embedding model's token window while preserving context across boundaries.
 */
export function chunkText(
  text: string,
  maxLen = 800,
  overlap = 120,
): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const sentences = cleaned
    .split(SENTENCE_BOUNDARY)
    .flatMap((s) => (s.length > maxLen ? hardSplit(s, maxLen) : [s]));

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const sentence of sentences) {
    if (current.length > 0 && currentLen + sentence.length + 1 > maxLen) {
      const joined = current.join(' ');
      chunks.push(joined);
      const tail = wordBoundaryTail(joined, overlap);
      current = tail ? [tail] : [];
      currentLen = tail.length;
    }
    current.push(sentence);
    currentLen += sentence.length + 1;
  }
  if (current.length > 0) chunks.push(current.join(' '));

  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

// ─── Google Gemini embeddings ───────────────────────────────────────────────

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

const EMBED_BATCH_SIZE = 50; // requests per batchEmbedContents call (API max 100)

async function embedBatch(
  texts: string[],
  cfg: EmbeddingConfig,
  taskType: TaskType,
): Promise<number[][]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:batchEmbedContents?key=${cfg.apiKey}`;

  const body = {
    requests: texts.map((text) => ({
      model: `models/${cfg.model}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: cfg.dim,
    })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Embedding request failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
  const vectors = data.embeddings?.map((e) => e.values ?? []) ?? [];
  if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
    throw new Error('Embedding response did not include a vector for every chunk.');
  }
  return vectors;
}

export async function embedTexts(
  texts: string[],
  taskType: TaskType,
  cfg: EmbeddingConfig = getEmbeddingConfig(),
): Promise<number[][]> {
  if (!isRagEnabled(cfg)) {
    throw new Error('Embeddings are not configured (set EMBEDDING_PROVIDER=google and GOOGLE_AI_API_KEY).');
  }

  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch, cfg, taskType);
    for (const v of vectors) {
      if (cfg.dim > 0 && v.length !== cfg.dim) {
        throw new Error(`Unexpected embedding dimension ${v.length} (expected ${cfg.dim}).`);
      }
      all.push(v);
    }
  }
  return all;
}

// ─── Ingestion ──────────────────────────────────────────────────────────────

export const MAX_CHUNKS_PER_SOURCE = 400;

export interface IngestSourceRow {
  id: string;
  agent_id: string;
  user_id: string;
  content: string | null;
}

export interface IngestResult {
  ok: boolean;
  chunkCount: number;
  error?: string;
}

/**
 * Runs a stored knowledge source through the full pipeline and updates its
 * status. Never throws — failures are recorded on the source row so the
 * dashboard can show them.
 */
export async function ingestKnowledgeSource(
  supabase: SupabaseClient,
  source: IngestSourceRow,
): Promise<IngestResult> {
  try {
    const content = cleanText(source.content || '');
    if (!content) throw new Error('No readable text content to index.');

    const chunks = chunkText(content);
    if (chunks.length === 0) throw new Error('Chunking produced no usable text.');
    if (chunks.length > MAX_CHUNKS_PER_SOURCE) {
      throw new Error(
        `Document is too large (${chunks.length} chunks; max ${MAX_CHUNKS_PER_SOURCE}). Split it into smaller documents.`,
      );
    }

    const vectors = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');

    // Replace any existing chunks so re-uploads/re-processing stay consistent.
    await supabase.from('knowledge_chunks').delete().eq('knowledge_source_id', source.id);

    // pgvector accepts '[0.1,0.2,...]' text literals; supabase-js would
    // serialize number arrays as Postgres `{1,2}` arrays which vector rejects.
    const rows = chunks.map((content, i) => ({
      knowledge_source_id: source.id,
      agent_id: source.agent_id,
      user_id: source.user_id,
      chunk_index: i,
      content,
      embedding: JSON.stringify(vectors[i]),
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from('knowledge_chunks')
        .insert(rows.slice(i, i + 100));
      if (error) throw new Error(`Failed to store chunks: ${error.message}`);
    }

    const { error: updateErr } = await supabase
      .from('knowledge_sources')
      .update({ status: 'ready', error_msg: null })
      .eq('id', source.id);
    if (updateErr) throw new Error(`Failed to finalize source: ${updateErr.message}`);

    return { ok: true, chunkCount: chunks.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion error.';
    await supabase
      .from('knowledge_sources')
      .update({ status: 'error', error_msg: message })
      .eq('id', source.id);
    return { ok: false, chunkCount: 0, error: message };
  }
}
