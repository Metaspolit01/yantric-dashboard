/*
# Yantric Platform — Full Schema

## Overview
Creates the complete database schema for the Yantric AI Voice Agent platform,
including a UPI payment gateway for credit purchases.

## New Tables
1. `profiles` — user profiles (credits balance, plan, mirrors auth.users)
2. `agents` — voice agents owned by users (business config, system prompt, stats)
3. `calls` — call log records linked to agents
4. `knowledge_sources` — documents/URLs/text attached to agents for RAG
5. `upi_payments` — UPI payment orders (pending/paid/failed) with UTR verification
6. `credit_transactions` — ledger of all credit changes (purchases, usage)

## Security
- RLS enabled on ALL tables.
- All tables are owner-scoped to `user_id` via `auth.uid()`.
- `deduct_credits` and `add_credits` are SECURITY DEFINER functions callable
  by `authenticated`.

## Important Notes
1. `profiles` is keyed to `auth.users.id` with `DEFAULT auth.uid()`.
2. `upi_payments` has a `utr` column with a partial unique index so duplicate
   UTR submissions are rejected at the database level (idempotency).
3. Free credits are NOT granted at signup. New users start at 0 credits.
*/

-- ─── profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── agents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  business_name text NOT NULL,
  business_description text,
  target_users text,
  common_questions text,
  responsibilities text,
  personality text,
  system_prompt text NOT NULL DEFAULT '',
  greeting_message text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en-IN',
  voice text NOT NULL DEFAULT 'priya',
  llm_model text NOT NULL DEFAULT 'google/gemma-4-31b-it',
  status text NOT NULL DEFAULT 'active',
  total_calls integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  total_credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_own" ON public.agents;
CREATE POLICY "agents_select_own" ON public.agents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agents_insert_own" ON public.agents;
CREATE POLICY "agents_insert_own" ON public.agents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agents_update_own" ON public.agents;
CREATE POLICY "agents_update_own" ON public.agents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agents_delete_own" ON public.agents;
CREATE POLICY "agents_delete_own" ON public.agents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── calls ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name text,
  status text NOT NULL DEFAULT 'in-progress',
  duration_seconds integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calls_select_own" ON public.calls;
CREATE POLICY "calls_select_own" ON public.calls
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "calls_insert_own" ON public.calls;
CREATE POLICY "calls_insert_own" ON public.calls
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calls_update_own" ON public.calls;
CREATE POLICY "calls_update_own" ON public.calls
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── knowledge_sources ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  content text,
  url text,
  file_size bigint,
  status text NOT NULL DEFAULT 'ready',
  error_msg text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_select_own" ON public.knowledge_sources;
CREATE POLICY "knowledge_select_own" ON public.knowledge_sources
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_insert_own" ON public.knowledge_sources;
CREATE POLICY "knowledge_insert_own" ON public.knowledge_sources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_update_own" ON public.knowledge_sources;
CREATE POLICY "knowledge_update_own" ON public.knowledge_sources
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_delete_own" ON public.knowledge_sources;
CREATE POLICY "knowledge_delete_own" ON public.knowledge_sources
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── upi_payments (must come before credit_transactions due to FK) ──────────
CREATE TABLE IF NOT EXISTS public.upi_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL,
  credits integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  utr text,
  upi_id text NOT NULL DEFAULT 'yantric@upi',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE public.upi_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upi_payments_select_own" ON public.upi_payments;
CREATE POLICY "upi_payments_select_own" ON public.upi_payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "upi_payments_insert_own" ON public.upi_payments;
CREATE POLICY "upi_payments_insert_own" ON public.upi_payments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "upi_payments_update_own" ON public.upi_payments;
CREATE POLICY "upi_payments_update_own" ON public.upi_payments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Partial unique index on UTR so a given transaction reference can only be used once
CREATE UNIQUE INDEX IF NOT EXISTS upi_payments_utr_unique
  ON public.upi_payments (utr)
  WHERE utr IS NOT NULL;

-- ─── credit_transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  upi_payment_id uuid REFERENCES public.upi_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_tx_select_own" ON public.credit_transactions;
CREATE POLICY "credit_tx_select_own" ON public.credit_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_tx_insert_own" ON public.credit_transactions;
CREATE POLICY "credit_tx_insert_own" ON public.credit_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ─── Functions ─────────────────────────────────────────────────────────────

-- SECURITY DEFINER: allows the service-role client to deduct credits atomically
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits - p_amount
  WHERE id = p_user_id;
END;
$$;

-- SECURITY DEFINER: adds credits (used after UPI payment verification)
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits + p_amount
  WHERE id = p_user_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer) TO authenticated;

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_agent_id ON public.knowledge_sources(agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_upi_payments_user_id ON public.upi_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_upi_payments_status ON public.upi_payments(status);