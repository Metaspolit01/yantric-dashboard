/*
# Yantric — Greeting spoken in the agent's primary language

Users may type the greeting in English (or any language). `greeting_spoken`
stores the version converted into the agent's PRIMARY language so the voice
always greets in that language (e.g. Telugu), with natural English
code-mixing. Empty → fall back to `greeting_message` as typed.
*/

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS greeting_spoken text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.agents.greeting_spoken IS
  'Greeting converted to the primary language for speech; empty = use greeting_message verbatim.';
