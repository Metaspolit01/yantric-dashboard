/*
# Yantric RAG — Knowledge Chunks + Vector Search

## Overview
Enables retrieval-augmented generation for agent knowledge bases.
Knowledge sources are chunked, embedded (Google Gemini
`gemini-embedding-001`, 768 dims by default) and searched with cosine
similarity via pgvector. The dashboard backend performs ingestion and
search; the voice agent retrieves through the dashboard API.

## New Objects
1. `vector` extension (pgvector)
2. `knowledge_chunks` — embedded chunks belonging to knowledge sources
3. `match_knowledge_chunks()` — cosine-similarity search RPC

## Security
- RLS enabled on `knowledge_chunks`; owner-scoped to `user_id`
  exactly like `knowledge_sources`.
- `match_knowledge_chunks` is SECURITY DEFINER and scoped by `p_agent_id`;
  it is called server-side by the backend, which already verifies the
  internal agent secret / user ownership before invoking it.
- Deleting a knowledge source (or agent/user) cascades to its chunks.

## Notes
- Embedding dimension is fixed at 768 in this migration. If you change
  EMBEDDING_DIM / embedding model later, a new migration is required
  (pgvector columns cannot change dimension in place).
*/

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── knowledge_chunks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (knowledge_source_id, chunk_index)
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chunks_select_own" ON public.knowledge_chunks;
CREATE POLICY "chunks_select_own" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chunks_insert_own" ON public.knowledge_chunks;
CREATE POLICY "chunks_insert_own" ON public.knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chunks_update_own" ON public.knowledge_chunks;
CREATE POLICY "chunks_update_own" ON public.knowledge_chunks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chunks_delete_own" ON public.knowledge_chunks;
CREATE POLICY "chunks_delete_own" ON public.knowledge_chunks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source
  ON public.knowledge_chunks(knowledge_source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_agent
  ON public.knowledge_chunks(agent_id);

-- HNSW approximate-nearest-neighbour index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- ─── Similarity search function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  p_agent_id uuid,
  p_query_embedding vector(768),
  p_match_count integer DEFAULT 5,
  p_min_similarity double precision DEFAULT 0.0
)
RETURNS TABLE (
  chunk_id uuid,
  knowledge_source_id uuid,
  source_name text,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id AS chunk_id,
    kc.knowledge_source_id AS knowledge_source_id,
    ks.name AS source_name,
    kc.content AS content,
    1 - (kc.embedding <=> p_query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.knowledge_source_id
  WHERE kc.agent_id = p_agent_id
    AND ks.status = 'ready'
    AND 1 - (kc.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(uuid, vector, integer, double precision)
  TO authenticated, service_role;
