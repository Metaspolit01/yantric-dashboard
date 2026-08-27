/**
 * Languages Yantric agents can speak.
 *
 * This list matches the languages Sarvam bulbul:v3 TTS can actually voice
 * (STT supports more, but the agent must be able to SPEAK a language for it
 * to be selectable). The agent's primary language is `agents.language`;
 * additional languages live in `agents.languages`.
 */
export interface AgentLanguage {
  code: string;
  label: string;
  native: string;
}

export const AGENT_LANGUAGES: AgentLanguage[] = [
  { code: "en-IN", label: "English", native: "English" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "bn-IN", label: "Bengali", native: "বাংলা" },
  { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
  { code: "pa-IN", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "od-IN", label: "Odia", native: "ଓଡ଼ିଆ" },
];

const VALID_CODES = new Set(AGENT_LANGUAGES.map((l) => l.code));

/** Filters an incoming list down to supported codes; empty → English. */
export function sanitizeLanguages(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((c) => String(c).trim())
    .filter((c) => VALID_CODES.has(c));
  return [...new Set(out)];
}

export function languageName(code: string): string {
  return AGENT_LANGUAGES.find((l) => l.code === code)?.label ?? "English";
}
