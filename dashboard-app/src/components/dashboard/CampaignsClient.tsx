"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud, Play, Pause, Trash2, ChevronDown, ChevronUp,
  PhoneCall, PhoneIncoming, Loader2,
} from "lucide-react";

interface AgentOption { id: string; name: string }
interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  from_number: string | null;
  created_at: string;
  agents?: { name?: string } | null;
}
interface CountRow { campaign_id: string; status: string; count: number }
interface Contact {
  id: string; phone: string; name: string | null; status: string;
  attempts: number; last_error: string | null;
}

const CONTACT_STATUS_STYLE: Record<string, string> = {
  pending: "text-white/30 bg-white/5",
  calling: "text-[#00E5FF] bg-[#00E5FF]/10 animate-pulse",
  completed: "text-green-400 bg-green-400/10",
  no_answer: "text-amber-400 bg-amber-400/10",
  failed: "text-red-400 bg-red-400/10",
};

export default function CampaignsClient({ agents, userName }: { agents: AgentOption[]; userName?: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openContacts, setOpenContacts] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [fromNumber, setFromNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Inbound numbers state
  const [numbers, setNumbers] = useState<Array<{ id: string; phone_number: string; label: string | null; agents?: { name?: string } }>>([]);
  const [numAgent, setNumAgent] = useState(agents[0]?.id || "");
  const [numValue, setNumValue] = useState("");
  const [numMsg, setNumMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setCounts(data.counts || []);
    }
    setLoading(false);
    const numRes = await fetch("/api/phone-numbers");
    if (numRes.ok) setNumbers((await numRes.json()).numbers || []);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live progress while any campaign is queued/running
  const active = campaigns.some((c) => ["queued", "running"].includes(c.status));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void refresh(); }, 8000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const countsFor = (id: string) => {
    const map: Record<string, number> = {};
    for (const c of counts) if (c.campaign_id === id) map[c.status] = c.count;
    return map;
  };

  const handleUpload = async () => {
    setMessage(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage({ ok: false, text: "Choose an .xlsx or .csv contact sheet first." });
    if (!agentId) return setMessage({ ok: false, text: "Select which agent should make these calls." });

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("agentId", agentId);
      fd.append("name", name);
      if (fromNumber.trim()) fd.append("fromNumber", fromNumber.trim());
      fd.append("file", file);
      const res = await fetch("/api/campaigns", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage({ ok: true, text: `Imported ${data.imported} contacts${data.skippedInvalid ? ` (${data.skippedInvalid} invalid rows skipped)` : ""}. Press Start to dial.` });
      setName(""); setFromNumber("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const changeStatus = async (c: Campaign, action: "start" | "pause") => {
    setBusyId(c.id);
    try {
      const url = action === "start" ? `/api/campaigns/${c.id}/start` : `/api/campaigns/${c.id}`;
      const res = await fetch(url, {
        method: action === "start" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "start" ? undefined : JSON.stringify({ status: "paused" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeCampaign = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}"? Contact history will be removed.`)) return;
    setBusyId(c.id);
    await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    setBusyId(null);
    await refresh();
  };

  const toggleContacts = async (id: string) => {
    if (openContacts === id) return setOpenContacts(null);
    setOpenContacts(id);
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.ok) setContacts((await res.json()).contacts || []);
  };

  const addNumber = async () => {
    setNumMsg(null);
    const res = await fetch("/api/phone-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: numAgent, phoneNumber: numValue }),
    });
    const data = await res.json();
    setNumMsg(res.ok ? data.note : data.error || "Failed to save number.");
    if (res.ok) { setNumValue(""); await refresh(); }
  };

  const removeNumber = async (id: string) => {
    await fetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
    await refresh();
  };

  if (agents.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-16 text-center">
        <PhoneCall className="w-10 h-10 text-white/10 mx-auto mb-4" />
        <h2 className="font-display font-bold text-lg text-white mb-2">Create an agent first</h2>
        <p className="text-white/35 text-sm">Outbound campaigns run with one of your voice agents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Upload ─────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <UploadCloud className="w-5 h-5 text-[#9d61ff]" />
          <h2 className="font-display font-bold text-white">New Campaign</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali follow-ups — August"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-[#7C3AED]/50 focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Calling agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#7C3AED]/50 focus:outline-none">
              {agents.map((a) => <option key={a.id} value={a.id} className="bg-[#12121a]">{a.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Caller ID (optional)</label>
            <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+919876543210"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-[#7C3AED]/50 focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Contact sheet (.xlsx or .csv — column “phone” or first column)</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              className="w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-[#7C3AED]/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#9d61ff]" />
          </div>
        </div>
        {message && (
          <p className={`mt-3 text-xs ${message.ok ? "text-green-400" : "text-red-400"}`}>{message.text}</p>
        )}
        <button onClick={handleUpload} disabled={uploading}
          className="btn-primary mt-4 inline-flex items-center gap-2 text-sm disabled:opacity-50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? "Importing…" : "Import Contacts"}
        </button>
      </div>

      {/* ── Campaign list ──────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="font-display font-bold text-white mb-4">Your Campaigns</h2>
        {loading ? (
          <p className="text-sm text-white/30 py-6 text-center">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-white/30 py-6 text-center">No campaigns yet — upload a sheet above.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const s = countsFor(c.id);
              const done = (s.completed || 0) + (s.no_answer || 0) + (s.failed || 0);
              const pct = c.total_contacts ? Math.round((done / c.total_contacts) * 100) : 0;
              return (
                <div key={c.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          c.status === "running" || c.status === "queued" ? "bg-[#00E5FF] animate-pulse"
                          : c.status === "completed" ? "bg-green-400"
                          : c.status === "paused" ? "bg-amber-400" : "bg-white/20"}`} />
                        <span className="font-semibold text-sm text-white truncate">{c.name}</span>
                      </div>
                      <div className="text-[11px] text-white/35 mt-1">
                        {c.agents?.name ?? "Agent"} · {done}/{c.total_contacts} dialed ·
                        {" "}{s.completed || 0} answered · {s.no_answer || 0} no-answer · {s.failed || 0} failed
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {["draft", "paused"].includes(c.status) && (
                        <button onClick={() => changeStatus(c, "start")} disabled={busyId === c.id}
                          className="btn-primary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50">
                          {busyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Start
                        </button>
                      )}
                      {["queued", "running"].includes(c.status) && (
                        <button onClick={() => changeStatus(c, "pause")} disabled={busyId === c.id}
                          className="text-xs text-amber-300 border border-amber-400/20 hover:bg-amber-400/10 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
                          <Pause className="w-3 h-3" /> Pause
                        </button>
                      )}
                      <button onClick={() => toggleContacts(c.id)} className="text-xs text-white/40 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 inline-flex items-center gap-1">
                        {openContacts === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Contacts
                      </button>
                      <button onClick={() => removeCampaign(c)} disabled={busyId === c.id}
                        className="text-xs text-white/30 hover:text-red-400 p-1.5 disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {openContacts === c.id && (
                    <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-white/[0.05]">
                      <table className="w-full text-left text-xs">
                        <thead className="text-white/30 sticky top-0 bg-[#12121a]">
                          <tr><th className="px-3 py-2 font-medium">Phone</th><th className="px-3 py-2 font-medium">Name</th>
                              <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Tries</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {(openContacts === c.id ? contacts : []).map((ct) => (
                            <tr key={ct.id}>
                              <td className="px-3 py-2 text-white/80">{ct.phone}</td>
                              <td className="px-3 py-2 text-white/40">{ct.name || "—"}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONTACT_STATUS_STYLE[ct.status] || "text-white/40 bg-white/5"}`}>
                                  {ct.status.replace("_", "-")}
                                </span>
                                {ct.last_error && <span className="ml-2 text-red-400/70">{ct.last_error}</span>}
                              </td>
                              <td className="px-3 py-2 text-white/30">{ct.attempts}</td>
                            </tr>
                          ))}
                          {contacts.length === 0 && (
                            <tr><td colSpan={4} className="px-3 py-3 text-white/25 text-center">Loading…</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Inbound numbers ────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <PhoneIncoming className="w-5 h-5 text-[#9d61ff]" />
          <h2 className="font-display font-bold text-white">Inbound Numbers</h2>
        </div>
        <p className="text-white/35 text-xs mb-4">
          Map a phone number (Vobiz DID) to an agent — callers who dial it talk to that agent.
        </p>
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <input value={numValue} onChange={(e) => setNumValue(e.target.value)} placeholder="+91 98765 43210"
            className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-[#7C3AED]/50 focus:outline-none" />
          <select value={numAgent} onChange={(e) => setNumAgent(e.target.value)}
            className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none">
            {agents.map((a) => <option key={a.id} value={a.id} className="bg-[#12121a]">{a.name}</option>)}
          </select>
          <button onClick={addNumber} className="btn-primary text-sm px-4 py-2.5">Map Number</button>
        </div>
        {numMsg && <p className="mt-2 text-xs text-white/45">{numMsg}</p>}
        <div className="mt-4 space-y-2">
          {numbers.map((n) => (
            <div key={n.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
              <div>
                <span className="text-sm text-white font-medium">{n.phone_number}</span>
                <span className="text-xs text-white/30 ml-2">→ {n.agents?.name ?? "agent"}</span>
                {n.label && <span className="text-xs text-white/25 ml-2">({n.label})</span>}
              </div>
              <button onClick={() => removeNumber(n.id)} className="text-white/25 hover:text-red-400 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
