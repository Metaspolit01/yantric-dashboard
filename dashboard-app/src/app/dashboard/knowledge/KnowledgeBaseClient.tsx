"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen, Upload, Globe, FileText, Plus, Trash2, Search, Sparkles,
  Bot, CheckCircle2, XCircle, Loader2, AlertCircle,
} from "lucide-react";
import AuthModal from "@/components/dashboard/AuthModal";

interface Props {
  isGuest: boolean;
  initialAgents: any[];
}

interface KnowledgeSource {
  id: string;
  type: string;
  name: string;
  url: string | null;
  status: string;
  error_msg: string | null;
  file_size: number | null;
  created_at: string;
}

// Demo documents for GUESTS only — shows what the feature looks like.
const DEMO_DOCUMENTS = [
  { id: "1", name: "Services_and_Pricing_2026.pdf", type: "PDF Document", size: "1.2 MB", date: "Aug 02, 2026", status: "Indexed" },
  { id: "2", name: "Frequently_Asked_Questions.docx", type: "Word Doc", size: "450 KB", date: "Aug 05, 2026", status: "Indexed" },
  { id: "3", name: "https://sharmadental.com/treatments", type: "Scraped Web Page", size: "12 Pages", date: "Aug 07, 2026", status: "Active" },
];

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function StatusBadge({ source }: { source: KnowledgeSource }) {
  if (source.status === "error") {
    return (
      <span className="flex items-center gap-1.5 w-fit text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-full">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  if (source.status === "processing") {
    return (
      <span className="flex items-center gap-1.5 w-fit text-[10px] font-semibold text-[#00E5FF] bg-[#00E5FF]/10 border border-[#00E5FF]/20 px-2 py-1 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" /> Indexing
      </span>
    );
  }
  return (
    <span className="badge-active flex items-center gap-1.5 w-fit text-[10px]">
      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Ready
    </span>
  );
}

export default function KnowledgeBaseClient({ isGuest, initialAgents }: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgents[0]?.id || "");
  const [activeTab, setActiveTab] = useState<"files" | "text" | "website">("files");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [featureName, setFeatureName] = useState<string | null>(null);

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [qaText, setQaText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const requireAuth = (name: string) => {
    if (isGuest) {
      setFeatureName(name);
      setAuthModalOpen(true);
      return true;
    }
    return false;
  };

  const loadSources = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`);
      if (res.ok) setSources((await res.json()).sources || []);
      else setSources([]);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isGuest && selectedAgentId) void loadSources(selectedAgentId);
  }, [isGuest, selectedAgentId, loadSources]);

  const addUrl = async () => {
    if (requireAuth("Scrape Website URL")) return;
    if (!websiteUrl.trim()) return setMessage({ ok: false, text: "Enter a website address first." });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", name: websiteUrl.trim(), url: websiteUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add that website.");
      setWebsiteUrl("");
      setMessage(data.source?.status === "error"
        ? { ok: false, text: data.source.error_msg || "That website could not be read." }
        : { ok: true, text: data.indexed ? `Website added and indexed (${data.chunkCount} chunks).` : "Website added." });
      await loadSources(selectedAgentId);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const addText = async () => {
    if (requireAuth("Save Q&A Knowledge Text")) return;
    if (!qaText.trim()) return setMessage({ ok: false, text: "Paste some knowledge text first." });
    setBusy(true);
    setMessage(null);
    try {
      const firstLine = qaText.trim().split("\n")[0].slice(0, 60) || "Pasted knowledge";
      const res = await fetch(`/api/agents/${selectedAgentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", name: firstLine, content: qaText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save that text.");
      setQaText("");
      setMessage({ ok: true, text: data.indexed ? `Knowledge saved and indexed (${data.chunkCount} chunks).` : "Knowledge saved." });
      await loadSources(selectedAgentId);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const uploadPdf = async (file: File) => {
    if (requireAuth("Upload Knowledge File")) return;
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/agents/${selectedAgentId}/knowledge/pdf`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that PDF.");
      setMessage(data.indexed ? `PDF indexed (${data.chunkCount} chunks).` : "PDF added to knowledge base.");
      await loadSources(selectedAgentId);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteSource = async (source: KnowledgeSource) => {
    if (requireAuth("Delete Knowledge Source")) return;
    if (!confirm(`Delete "${source.name}"? Your agent will no longer use this knowledge.`)) return;
    const res = await fetch(`/api/agents/${selectedAgentId}/knowledge/${source.id}`, { method: "DELETE" });
    if (res.ok) {
      setSources(prev => prev.filter(s => s.id !== source.id));
      setMessage({ ok: true, text: "Source deleted." });
    } else {
      setMessage({ ok: false, text: "Could not delete that source." });
    }
  };

  const visible = sources.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-xs font-semibold text-[#9d61ff] mb-2">
            <BookOpen className="w-3.5 h-3.5" /> AI Knowledge Base &amp; RAG Engine
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-white">Knowledge Base</h1>
          <p className="text-white/50 text-sm mt-1">
            Train your voice agents with custom business documents, FAQs, price lists, and website content.
          </p>
        </div>
      </div>

      {/* Select Agent */}
      <div className="glass-card rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#9d61ff]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase">Selected Voice Agent</div>
            <div className="text-sm font-bold text-white">
              {isGuest
                ? "Demo Voice Agent (Dental Clinic)"
                : initialAgents.find(a => a.id === selectedAgentId)?.name || "—"}
            </div>
          </div>
        </div>

        {!isGuest && (
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="yantric-input text-xs py-2 px-4 bg-white/[0.05] border-white/10 text-white rounded-xl cursor-pointer"
          >
            {initialAgents.length > 0 ? (
              initialAgents.map(a => (
                <option key={a.id} value={a.id} className="bg-[#0f101a] text-white">
                  {a.name} ({a.business_name || "General"})
                </option>
              ))
            ) : (
              <option value="" className="bg-[#0f101a] text-white">No agents yet — create one first</option>
            )}
          </select>
        )}
      </div>

      {/* Add Knowledge Source */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <h2 className="font-display font-semibold text-white text-base">Add New Knowledge Source</h2>
          <div className="flex rounded-xl bg-white/[0.05] p-1 border border-white/10">
            {([
              { id: "files", label: "Upload File", Icon: Upload },
              { id: "website", label: "Web Scraper", Icon: Globe },
              { id: "text", label: "Q&A Text", Icon: FileText },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => { if (requireAuth(label)) return; setActiveTab(id); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === id ? "bg-[#7C3AED] text-white shadow" : "text-white/50 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
            message.ok
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
              : "bg-red-500/10 border-red-500/25 text-red-300"
          }`}>
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {message.text}
          </div>
        )}

        {activeTab === "files" && (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-[#7C3AED]/50 rounded-2xl p-8 text-center cursor-pointer bg-white/[0.01] hover:bg-white/[0.03] transition-all group"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPdf(f);
              }}
            />
            <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              {busy ? <Loader2 className="w-6 h-6 text-[#9d61ff] animate-spin" /> : <Upload className="w-6 h-6 text-[#9d61ff]" />}
            </div>
            <h3 className="font-bold text-white text-sm">{busy ? "Reading your document…" : "Drop a PDF document here"}</h3>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              Upload price lists, appointment policies, FAQs, or guidelines — text-based PDFs up to 10MB.
            </p>
            <button className="btn-primary text-xs px-4 py-2 mt-4 inline-flex items-center gap-2">
              <Upload className="w-3.5 h-3.5" /> Browse Files
            </button>
          </div>
        )}

        {activeTab === "website" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="yourcompany.com/services  (https:// added automatically)"
                  className="yantric-input pl-10 bg-white/[0.04] border-white/10"
                />
              </div>
              <button
                onClick={addUrl}
                disabled={busy || !selectedAgentId}
                className="btn-primary text-xs px-5 py-3 flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Crawl &amp; Extract
              </button>
            </div>
            <p className="text-xs text-white/40">
              Yantric fetches the page, strips navigation and scripts, and indexes the readable text for your voice agent.
            </p>
          </div>
        )}

        {activeTab === "text" && (
          <div className="space-y-4">
            <textarea
              rows={4}
              value={qaText}
              onChange={(e) => setQaText(e.target.value)}
              placeholder={"Q: What are your clinic opening hours?\nA: We are open Monday to Saturday from 9 AM to 8 PM."}
              className="yantric-input bg-white/[0.04] border-white/10 text-xs"
            />
            <div className="flex justify-end">
              <button
                onClick={addText}
                disabled={busy || !selectedAgentId}
                className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Knowledge Text
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Indexed Knowledge Sources */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display font-semibold text-white text-base">Indexed Knowledge Sources</h2>
            <p className="text-xs text-white/40">Active knowledge base sources accessible to this voice agent during calls</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sources…"
              className="yantric-input pl-9 text-xs py-2 bg-white/[0.04] border-white/10 w-56"
            />
          </div>
        </div>

        {isGuest ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/40 uppercase tracking-wider">
                  <th className="py-3 px-4">Document Name</th><th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Size</th><th className="py-3 px-4">Added Date</th><th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {DEMO_DOCUMENTS.map(doc => (
                  <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white">{doc.name}</td>
                    <td className="py-3.5 px-4 text-white/60">{doc.type}</td>
                    <td className="py-3.5 px-4 text-white/60">{doc.size}</td>
                    <td className="py-3.5 px-4 text-white/40">{doc.date}</td>
                    <td className="py-3.5 px-4"><span className="badge-active flex items-center gap-1.5 w-fit text-[10px]"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> {doc.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-white/25 mt-3 px-4">Sample data — sign in to manage your real knowledge base.</p>
          </div>
        ) : loading ? (
          <p className="text-sm text-white/30 py-8 text-center">Loading sources…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-white/30 py-8 text-center">
            No knowledge sources for this agent yet — add a website, PDF, or text above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/40 uppercase tracking-wider">
                  <th className="py-3 px-4">Document Name</th><th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Size</th><th className="py-3 px-4">Added Date</th>
                  <th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {visible.map(source => (
                  <tr key={source.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white max-w-[16rem]">
                      <span className="flex items-center gap-2.5">
                        {source.type === "url" ? (
                          <Globe className="w-4 h-4 text-[#00E5FF] shrink-0" />
                        ) : source.type === "pdf" ? (
                          <FileText className="w-4 h-4 text-[#9d61ff] shrink-0" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <span className="truncate">{source.name}</span>
                      </span>
                      {source.error_msg && (
                        <span className="block text-red-400/70 text-[11px] mt-1 pl-6 truncate" title={source.error_msg}>
                          {source.error_msg}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-white/60 capitalize">{source.type === "url" ? "Web Page" : source.type}</td>
                    <td className="py-3.5 px-4 text-white/60">{formatSize(source.file_size)}</td>
                    <td className="py-3.5 px-4 text-white/40">{new Date(source.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="py-3.5 px-4"><StatusBadge source={source} /></td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => deleteSource(source)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="login"
        featureName={featureName || "Knowledge Base Management"}
      />
    </div>
  );
}
