"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Globe, FileText, Type, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface KnowledgeSource {
  id: string;
  type: string;
  name: string;
  url?: string;
  status: string;
  error_msg?: string;
  created_at: string;
}

interface Props {
  agentId: string;
  initialSources: KnowledgeSource[];
}

type AddMode = "text" | "url" | null;

export default function KnowledgeManager({ agentId, initialSources }: Props) {
  const [sources, setSources] = useState<KnowledgeSource[]>(initialSources);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [form, setForm] = useState({ name: "", content: "", url: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!addMode) return;
    setError("");
    setLoading(true);

    const body: Record<string, string> = { type: addMode, name: form.name };
    if (addMode === "text") body.content = form.content;
    if (addMode === "url") body.url = form.url;

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add source."); return; }
      setSources(prev => [data.source, ...prev]);
      setAddMode(null);
      setForm({ name: "", content: "", url: "" });
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm("Remove this knowledge source?")) return;
    const res = await fetch(`/api/agents/${agentId}/knowledge/${sourceId}`, { method: "DELETE" });
    if (res.ok) setSources(prev => prev.filter(s => s.id !== sourceId));
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "ready") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
  };

  const typeIcon = (type: string) => {
    if (type === "url") return <Globe className="w-4 h-4 text-[#00E5FF]" />;
    if (type === "pdf") return <FileText className="w-4 h-4 text-[#9d61ff]" />;
    return <Type className="w-4 h-4 text-white/40" />;
  };

  return (
    <div className="space-y-4">
      {/* Add Source Buttons */}
      {!addMode && (
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setAddMode("url")} className="btn-primary flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4" /> Add Website URL
          </button>
          <button onClick={() => setAddMode("text")} className="btn-ghost flex items-center gap-2 text-sm">
            <Type className="w-4 h-4" /> Add Text
          </button>
          <button disabled className="btn-ghost flex items-center gap-2 text-sm opacity-40 cursor-not-allowed" title="Coming soon">
            <FileText className="w-4 h-4" /> Upload PDF (coming soon)
          </button>
        </div>
      )}

      {/* Add Form */}
      {addMode && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            {addMode === "url" ? <Globe className="w-4 h-4 text-[#00E5FF]" /> : <Type className="w-4 h-4" />}
            {addMode === "url" ? "Add Website URL" : "Add Text Content"}
          </h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Name / Label</label>
            <input
              className="yantric-input"
              placeholder={addMode === "url" ? "e.g. Company Website" : "e.g. FAQ, Services List"}
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          {addMode === "url" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Website URL</label>
              <input
                className="yantric-input"
                type="url"
                placeholder="https://your-business.com/about"
                value={form.url}
                onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
              />
              <p className="text-xs text-white/25">We&apos;ll fetch the page content and extract useful text.</p>
            </div>
          )}

          {addMode === "text" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Content</label>
              <textarea
                className="yantric-input resize-none"
                rows={6}
                placeholder="Paste your business information, FAQ, services list, pricing, etc. here…"
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={loading || !form.name.trim() || (addMode === "url" && !form.url.trim()) || (addMode === "text" && !form.content.trim())}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? "Adding…" : "Add Source"}
            </button>
            <button onClick={() => { setAddMode(null); setError(""); }} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sources List */}
      {sources.length === 0 && !addMode ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-white/40 text-sm">No knowledge sources yet.</p>
          <p className="text-white/25 text-xs mt-1 max-w-xs mx-auto">
            Add your business website or paste your company information so your agent can answer questions accurately.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(src => (
            <div key={src.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0">
                {typeIcon(src.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{src.name}</div>
                {src.url && <div className="text-xs text-white/30 truncate">{src.url}</div>}
                {src.error_msg && <div className="text-xs text-red-400/70 truncate">{src.error_msg}</div>}
              </div>
              <StatusIcon status={src.status} />
              <button
                onClick={() => handleDelete(src.id)}
                className="w-8 h-8 rounded-lg bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookOpen({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
