/*
# Yantric — Call Completion, Telephony & Outbound Campaigns

## Overview
1. Extends `calls` so the voice agent can report call completion
   (duration, transcript, caller phone) and so credit deduction is
   idempotent (charged exactly once per call).
2. Adds telephony tables for inbound numbers and outbound campaigns:
   - `phone_numbers`      — DID → agent mapping for inbound calls
   - `outbound_campaigns` — Excel/CSV upload batches of contacts to dial
   - `campaign_contacts`  — individual dial records with status tracking
3. Adds `bump_agent_stats()` used by the backend when a call completes.

## Security
- RLS enabled on all new tables, owner-scoped via `auth.uid()`.
- `bump_agent_stats` is SECURITY DEFINER, called only server-side.
*/

-- ─── calls: completion + telephony columns ─────────────────────────────────
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'web-test';
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS caller_phone text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS recording_url text;
-- Idempotency flag: credits must be deducted at most once per call.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS credits_charged boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calls_room_name ON public.calls(room_name);

-- ─── phone_numbers (inbound DID → agent routing) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  phone_number text NOT NULL UNIQUE,
  label text,
  provider text NOT NULL DEFAULT 'twilio',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "numbers_select_own" ON public.phone_numbers;
CREATE POLICY "numbers_select_own" ON public.phone_numbers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "numbers_insert_own" ON public.phone_numbers;
CREATE POLICY "numbers_insert_own" ON public.phone_numbers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "numbers_update_own" ON public.phone_numbers;
CREATE POLICY "numbers_update_own" ON public.phone_numbers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "numbers_delete_own" ON public.phone_numbers;
CREATE POLICY "numbers_delete_own" ON public.phone_numbers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_agent ON public.phone_numbers(agent_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_lookup ON public.phone_numbers(phone_number) WHERE status = 'active';

-- ─── outbound_campaigns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outbound_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  from_number text,
  -- draft | queued | running | paused | completed | failed
  status text NOT NULL DEFAULT 'draft',
  total_contacts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select_own" ON public.outbound_campaigns;
CREATE POLICY "campaigns_select_own" ON public.outbound_campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_insert_own" ON public.outbound_campaigns;
CREATE POLICY "campaigns_insert_own" ON public.outbound_campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_update_own" ON public.outbound_campaigns;
CREATE POLICY "campaigns_update_own" ON public.outbound_campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_delete_own" ON public.outbound_campaigns;
CREATE POLICY "campaigns_delete_own" ON public.outbound_campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.outbound_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_dialer ON public.outbound_campaigns(status)
  WHERE status IN ('queued', 'running');

-- ─── campaign_contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.outbound_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  -- pending | calling | completed | no_answer | failed
  status text NOT NULL DEFAULT 'pending',
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON public.campaign_contacts;
CREATE POLICY "contacts_select_own" ON public.campaign_contacts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_insert_own" ON public.campaign_contacts;
CREATE POLICY "contacts_insert_own" ON public.campaign_contacts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_update_own" ON public.campaign_contacts;
CREATE POLICY "contacts_update_own" ON public.campaign_contacts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_delete_own" ON public.campaign_contacts;
CREATE POLICY "contacts_delete_own" ON public.campaign_contacts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON public.campaign_contacts(campaign_id);
-- Claiming index: the dialer picks the oldest pending contact of dialable campaigns.
CREATE INDEX IF NOT EXISTS idx_contacts_claim
  ON public.campaign_contacts(campaign_id, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.campaign_contacts(user_id);

-- ─── bump_agent_stats ──────────────────────────────────────────────────────
-- Atomically increments an agent's aggregate counters when a call completes.
CREATE OR REPLACE FUNCTION public.bump_agent_stats(
  p_agent_id uuid,
  p_duration_seconds integer,
  p_credits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agents
  SET total_calls = total_calls + 1,
      total_minutes = total_minutes + CEIL(GREATEST(p_duration_seconds, 0) / 60.0)::int,
      total_credits_used = total_credits_used + GREATEST(p_credits, 0),
      updated_at = now()
  WHERE id = p_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_agent_stats(uuid, integer, integer)
  TO authenticated, service_role;
