"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Bot, Loader2, Sparkles, CheckCircle2, Check } from "lucide-react";
import { AGENT_LANGUAGES } from "@/lib/languages";

interface Props {
  agent: any;
}

export default function EditAgentClient({ agent }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: agent.name || "",
    business_name: agent.business_name || "",
    business_description: agent.business_description || "",
    target_users: agent.target_users || "",
    common_questions: agent.common_questions || "",
    responsibilities: agent.responsibilities || "",
    personality: agent.personality || "",
    greeting_message: agent.greeting_message || "",
    language: agent.language || "en-IN",
    languages: (agent.languages && agent.languages.length > 0)
      ? agent.languages
      : [agent.language || "en-IN"],
    voice: agent.voice || "priya",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      // Include languages array in the update
      const payload = {
        ...form,
        languages: [form.language], // For edit page, keep single language for now
      };
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update agent.");
        setSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/dashboard/agents/${agent.id}`);
        router.refresh();
      }, 1000);

    } catch {
      setError("Network connection error. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/agents/${agent.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Agent Details
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/30 flex items-center justify-center">
            <Bot className="w-6 h-6 text-[#9d61ff]" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-white">Edit Voice Agent Questions & Prompt</h1>
            <p className="text-white/40 text-xs">
              Updating your business answers automatically recalculates system prompt & syncs assistant_prompt.txt
            </p>
          </div>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>Agent updated successfully! Syncing system prompt & assistant_prompt.txt…</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-7 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Agent Internal Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              className="yantric-input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Business Name</label>
            <input
              type="text"
              value={form.business_name}
              onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))}
              required
              className="yantric-input"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">1. Business Description</label>
          <textarea
            rows={3}
            value={form.business_description}
            onChange={e => setForm(p => ({ ...p, business_description: e.target.value }))}
            required
            className="yantric-input text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">2. Who are your customers / callers?</label>
          <textarea
            rows={3}
            value={form.target_users}
            onChange={e => setForm(p => ({ ...p, target_users: e.target.value }))}
            required
            className="yantric-input text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">3. What do customers usually ask? (Common Questions & Answers)</label>
          <textarea
            rows={3}
            value={form.common_questions}
            onChange={e => setForm(p => ({ ...p, common_questions: e.target.value }))}
            required
            className="yantric-input text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">4. What should your agent help with / accomplish?</label>
          <textarea
            rows={3}
            value={form.responsibilities}
            onChange={e => setForm(p => ({ ...p, responsibilities: e.target.value }))}
            required
            className="yantric-input text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">5. Personality & Tone</label>
          <textarea
            rows={2}
            value={form.personality}
            onChange={e => setForm(p => ({ ...p, personality: e.target.value }))}
            required
            className="yantric-input text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">6. First Greeting (spoken exactly as written when the call starts)</label>
          <textarea
            rows={2}
            value={form.greeting_message}
            onChange={e => setForm(p => ({ ...p, greeting_message: e.target.value }))}
            placeholder="Hello! Thank you for calling us. How can I help you today?"
            className="yantric-input text-sm"
          />
          <p className="text-[11px] text-white/30">
            Type in English or any language — it is automatically converted to the agent's primary
            language for speaking (with natural English word-mixing). Keep it short; the voice reads it exactly.
          </p>
        </div>

        {/* Languages */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Languages (agent mirrors each caller's language)</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {AGENT_LANGUAGES.map(opt => {
              const selected = form.languages.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setForm(p => {
                    const has = p.languages.includes(opt.code);
                    let next = has ? p.languages.filter(c => c !== opt.code) : [...p.languages, opt.code];
                    if (next.length === 0) next = ["en-IN"];
                    return { ...p, languages: next, language: next[0] };
                  })}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    selected
                      ? "border-[#7C3AED]/50 bg-[#7C3AED]/10 text-white"
                      : "border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-white/15"
                  }`}
                >
                  <span className="text-sm font-medium">{opt.native}<span className="block text-[10px] opacity-60">{opt.label}</span></span>
                  {selected && <Check className="w-4 h-4 text-[#9d61ff]" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/30">
            The agent mirrors each caller's language. Saving regenerates the system prompt with your language rules.
          </p>
          {form.languages.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Primary Language (greetings &amp; default voice)</label>
              <select
                value={form.language}
                onChange={e => setForm(p => {
                  const primary = e.target.value;
                  return { ...p, language: primary, languages: [primary, ...p.languages.filter(c => c !== primary)] };
                })}
                className="yantric-input bg-[#0f101a] text-white max-w-xs"
              >
                {form.languages.map(code => (
                  <option key={code} value={code} className="bg-[#12121a]">
                    {AGENT_LANGUAGES.find(l => l.code === code)?.label ?? code}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Voice & Model Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-white/10">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Voice Speaker</label>
            <select
              value={form.voice}
              onChange={e => setForm(p => ({ ...p, voice: e.target.value }))}
              className="yantric-input bg-[#0f101a] text-white"
            >
              <option value="priya">Priya — Female (Warm &amp; Professional)</option>
              <option value="shubh">Shubh — Male (Confident &amp; Clear)</option>
              <option value="kavya">Kavya — Female (Expressive &amp; Friendly)</option>
              <option value="rahul">Rahul — Male (Professional &amp; Clear)</option>
              <option value="simran">Simran — Female (Clear &amp; Engaging)</option>
              <option value="aditya">Aditya — Male (Natural &amp; Friendly)</option>
              <option value="pooja">Pooja — Female (Soft &amp; Professional)</option>
              <option value="rohan">Rohan — Male (Smooth &amp; Conversational)</option>
              <option value="shreya">Shreya — Female (Energetic &amp; Bright)</option>
              <option value="kabir">Kabir — Male (Deep &amp; Authoritative)</option>
              <option value="ritu">Ritu — Female (Calm &amp; Formal)</option>
              <option value="amit">Amit — Male (Clear &amp; Energetic)</option>
              <option value="sophia">Sophia — Female (Smooth &amp; Natural)</option>
              <option value="dev">Dev — Male (Crisp &amp; Young)</option>
              <option value="tanya">Tanya — Female (Crisp &amp; Modern)</option>
              <option value="varun">Varun — Male (Dynamic &amp; Engaging)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Language</label>
            <select
              value={form.language}
              onChange={e => setForm(p => ({ ...p, language: e.target.value }))}
              className="yantric-input bg-[#0f101a] text-white"
            >
              <option value="en-IN">English &amp; Indian Accents (en-IN)</option>
              <option value="te-IN">Telugu &amp; English (te-IN)</option>
              <option value="hi-IN">Hindi &amp; English (hi-IN)</option>
            </select>
          </div>

        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <Link href={`/dashboard/agents/${agent.id}`} className="btn-ghost text-xs px-5 py-2.5">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2 shadow-lg shadow-[#7C3AED]/25"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving & Regenerating Prompt…</>
            ) : (
              <><Save className="w-4 h-4" /> Save & Sync Voice Agent</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
