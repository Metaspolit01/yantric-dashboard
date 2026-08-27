/*
# Yantric — Atomic Call Billing

`finalize_call_billing()` completes a call's billing in ONE transaction:
locks the call row (idempotent — credits can never be charged twice),
computes credits from duration, clamps to the available balance, deducts,
writes the ledger entry, and bumps agent stats.

Called only by the backend (service role / authenticated via RPC grant).
*/

CREATE OR REPLACE FUNCTION public.finalize_call_billing(
  p_call_id uuid,
  p_duration_seconds integer,
  p_credits_per_minute integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_agent uuid;
  v_already boolean;
  v_balance integer;
  v_duration integer;
  v_minutes integer;
  v_credits integer;
  v_charge integer;
BEGIN
  -- Lock the call row so concurrent completions are serialized.
  SELECT user_id, agent_id, credits_charged
    INTO v_user, v_agent, v_already
  FROM public.calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call % not found', p_call_id;
  END IF;

  -- Idempotency: never charge a call twice.
  IF v_already THEN
    RETURN 0;
  END IF;

  v_duration := GREATEST(COALESCE(p_duration_seconds, 0), 0);

  IF v_duration <= 0 THEN
    UPDATE public.calls
    SET credits_charged = true, credits_used = 0
    WHERE id = p_call_id;
    RETURN 0;
  END IF;

  v_minutes := CEIL(v_duration / 60.0);
  v_credits := v_minutes * GREATEST(COALESCE(p_credits_per_minute, 0), 0);

  -- Clamp to balance so a call can never push an account negative.
  SELECT credits INTO v_balance FROM public.profiles WHERE id = v_user FOR UPDATE;
  v_charge := LEAST(v_credits, GREATEST(COALESCE(v_balance, 0), 0));

  UPDATE public.profiles SET credits = credits - v_charge WHERE id = v_user;

  UPDATE public.calls
  SET credits_used = v_charge,
      duration_seconds = v_duration,
      credits_charged = true
  WHERE id = p_call_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, call_id)
  VALUES (
    v_user,
    -v_charge,
    'usage',
    'Call — ' || v_minutes || ' minute' || CASE WHEN v_minutes <> 1 THEN 's' ELSE '' END,
    p_call_id
  );

  IF v_agent IS NOT NULL THEN
    PERFORM public.bump_agent_stats(v_agent, v_duration, v_charge);
  END IF;

  RETURN v_charge;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_call_billing(uuid, integer, integer)
  TO authenticated, service_role;
