/*
# Yantric — Multi-language Agents

Adds `agents.languages` (text array) so an agent can speak multiple
languages: the worker auto-detects the caller's language (Sarvam STT
`unknown` mode) and the LLM mirrors it; the voice engine picks the matching
TTS voice per reply.

- `agents.language` remains the PRIMARY language (languages[1]) and is
  used whenever no list is set — fully backward compatible.
- Only languages Sarvam bulbul:v3 TTS can voice are selectable in the
  dashboard (see dashboard-app/src/lib/languages.ts).
*/

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agents.languages IS
  'Additional/ordered spoken languages; first entry mirrors language (primary).';
