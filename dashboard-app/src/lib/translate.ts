import { languageName } from "./languages";

/**
 * Translates a voice greeting into the agent's primary language using the
 * same Google Gemini key configured for embeddings.
 *
 * Translation follows the Sarvam TTS best practices: native script for the
 * target language, brand/common English words kept in English script for
 * natural code-mixing (the way Indians really talk).
 *
 * Returns null when Gemini is not configured or the call fails — callers
 * fall back to speaking the greeting as typed.
 */
export async function translateGreeting(
  text: string,
  targetCode: string,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || "";
  const clean = text.trim();
  if (!apiKey || !clean) return null;

  const model = process.env.GEMINI_TRANSLATE_MODEL || "gemini-2.5-flash";
  const lang = languageName(targetCode) || "English";

  const prompt =
    `Translate the following voice-agent greeting into ${lang}.\n` +
    `Rules:\n` +
    `- Write ${lang} in its native script (never Romanised).\n` +
    `- Keep brand names and common English words (order, confirm, meeting, price...) in English script — natural code-mixing, the way real Indians speak.\n` +
    `- Keep it short, warm and spoken-style, suitable for text-to-speech.\n` +
    `- End native sentences with "।" and English sentences with ".".\n` +
    `- Output ONLY the translated greeting text — no explanations, no quotes.\n\n` +
    `GREETING:\n${clean}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) {
      console.error("[TranslateGreeting] Gemini request failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    const out: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text || "")
      .join(" ")
      .trim();
    return out || null;
  } catch (err) {
    console.error("[TranslateGreeting] Failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
