/*
# Update credit rate to 1 credit = 1 minute

## Changes
- Updates the `deduct_credits` SECURITY DEFINER function to guard against
  negative balances (refuses to let credits go below zero).
- No schema changes — just function body updates for safety.
*/

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = GREATEST(0, credits - p_amount)
  WHERE id = p_user_id;
END;
$$;

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
