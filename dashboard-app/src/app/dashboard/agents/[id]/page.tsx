import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, Phone, Clock, Zap, BookOpen, Edit, ArrowLeft, Volume2, Globe } from "lucide-react";
import TestAgentWidget from "@/components/dashboard/TestAgentWidget";
import GuestGate from "@/components/dashboard/GuestGate";
import AgentStatusToggle from "@/components/dashboard/AgentStatusToggle";

type Params = { params: Promise<{ id: string }> };

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; dot: string }> = {
    active: { cls: "badge-active", dot: "bg-green-400 animate-pulse" },
    paused: { cls: "badge-paused", dot: "bg-amber-400" },
  };
  const s = cfg[status] || cfg.paused;
  return (
    <span className={s.cls}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function voiceDisplayName(v: string) {
  if (!v) return "Priya (Indian Female)";
  const map: Record<string, string> = {
    priya: "Priya (Female · Warm)",
    shubh: "Shubh (Male · Confident)",
    kavya: "Kavya (Female · Friendly)",
    rahul: "Rahul (Male · Professional)",
    simran: "Simran (Female · Clear)",
    aditya: "Aditya (Male · Natural)",
    pooja: "Pooja (Female · Soft)",
    rohan: "Rohan (Male · Smooth)",
    shreya: "Shreya (Female · Energetic)",
    kabir: "Kabir (Male · Deep)",
    ritu: "Ritu (Female · Calm)",
    amit: "Amit (Male · Clear)",
    sophia: "Sophia (Female · Natural)",
    dev: "Dev (Male · Crisp)",
    tanya: "Tanya (Female · Modern)",
    varun: "Varun (Male · Dynamic)",
    arjun: "Shubh (Male · Confident)",
    meera: "Priya (Female · Warm)",
  };
  const key = v.toLowerCase().trim();
  return map[key] || (v.charAt(0).toUpperCase() + v.slice(1));
}

function langDisplayName(l: string) {
  if (l === "en-IN") return "English (India) — en-IN";
  if (l === "te-IN") return "Telugu & English — te-IN";
  if (l === "hi-IN") return "Hindi & English — hi-IN";
  return l || "en-IN";
}

interface AgentDetailContentProps {
  agent: any;
  sources: any[] | null;
  recentCalls: any[] | null;
  id: string;
  isGuest?: boolean;
}

function AgentDetailContent({ agent, sources, recentCalls, id, isGuest = false }: AgentDetailContentProps) {
  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/dashboard/agents" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> All Agents
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/25 flex items-center justify-center">
              <Bot className="w-7 h-7 text-[#9d61ff]" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display font-bold text-2xl text-white">{agent.name}</h1>
                <StatusBadge status={agent.status} />
              </div>
              <p className="text-white/40 text-sm">{agent.business_name}</p>
            </div>
          </div>
          {!isGuest && (
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/agents/${id}/edit`} className="btn-ghost flex items-center gap-2 text-xs">
                <Edit className="w-3.5 h-3.5" /> Edit Prompt & Settings
              </Link>
              <Link href={`/dashboard/agents/${id}/knowledge`} className="btn-ghost flex items-center gap-2 text-xs">
                <BookOpen className="w-3.5 h-3.5" /> Knowledge Base
              </Link>
              <AgentStatusToggle agentId={agent.id} status={agent.status} />
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Calls", value: agent.total_calls ?? 0, icon: Phone, color: "#10b981" },
          { label: "Total Minutes", value: agent.total_minutes ?? 0, icon: Clock, color: "#00E5FF" },
          { label: "Credits Used", value: agent.total_credits_used ?? 0, icon: Zap, color: "#9d61ff" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card text-center">
            <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
            <div className="font-display font-bold text-2xl text-white">{value}</div>
            <div className="text-xs text-white/35 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Agent Widget */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-semibold text-white mb-6 flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#9d61ff]" />
            Test Your Voice Agent
          </h2>
          {isGuest ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center mx-auto">
                <Bot className="w-8 h-8 text-[#9d61ff]/50" />
              </div>
              <p className="text-white/40 text-sm">Sign in to test your agent with live voice</p>
              <Link href="/register" className="btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-1.5">
                Create Free Account
              </Link>
            </div>
          ) : (
            <TestAgentWidget agentId={agent.id} agentName={agent.name} />
          )}
        </div>

        {/* Agent Info */}
        <div className="space-y-4">
          {/* Configuration Card */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400" /> Voice Configuration
              </h3>
              {!isGuest && (
                <Link href={`/dashboard/agents/${id}/edit`} className="text-xs text-[#9d61ff] hover:underline">
                  Edit
                </Link>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-white/50 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" /> TTS Voice Speaker
                </span>
                <span className="text-white font-semibold">{voiceDisplayName(agent.voice)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-white/50 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" /> Language & STT
                </span>
                <span className="text-white font-semibold">{langDisplayName(agent.language)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-white/50">Created Date</span>
                <span className="text-white/80 font-medium">{new Date(agent.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            </div>

            {/* Prompt snippet preview */}
            <div className="pt-2">
              <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-1.5">System Prompt Preview</div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white/60 font-mono line-clamp-3 leading-relaxed">
                {agent.system_prompt}
              </div>
            </div>
          </div>

          {/* Knowledge Sources */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider">Knowledge Base</h3>
              {!isGuest && (
                <Link href={`/dashboard/agents/${id}/knowledge`} className="text-xs text-[#9d61ff] hover:text-[#7C3AED]">
                  Manage →
                </Link>
              )}
            </div>
            {!sources || sources.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-white/30 text-xs">No knowledge sources added yet.</p>
                {!isGuest && (
                  <Link href={`/dashboard/agents/${id}/knowledge`} className="text-xs text-[#9d61ff] mt-2 inline-block font-semibold">
                    + Add knowledge documents
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((src: any) => (
                  <div key={src.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${src.status === "ready" ? "bg-green-400" : src.status === "error" ? "bg-red-400" : "bg-amber-400 animate-pulse"}`} />
                    <span className="text-xs text-white/60 truncate">{src.name}</span>
                    <span className="text-[10px] text-white/25 ml-auto uppercase">{src.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      {recentCalls && recentCalls.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#00E5FF]" />
              Recent Calls
            </h3>
            <Link href={`/dashboard/calls?agent_id=${id}`} className="text-xs text-white/40 hover:text-white">View all →</Link>
          </div>
          <div className="space-y-2">
            {recentCalls.map((call: any) => (
              <div key={call.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-sm">
                <div className={`w-2 h-2 rounded-full shrink-0 ${call.status === "completed" ? "bg-green-400" : "bg-white/20"}`} />
                <span className="text-white/60 flex-1">{new Date(call.started_at).toLocaleString("en-IN")}</span>
                <span className="text-white/50">{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</span>
                <span className="text-[#9d61ff] text-xs">{call.credits_used} cr</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function AgentDetailPage({ params }: Params) {
  const session = await getOptionalSession();
  const isGuest = !session;
  const { id } = await params;

  if (isGuest) {
    // Show a full demo preview for guests with sample data
    const demoAgent = {
      id: "demo",
      name: "Dental Receptionist Agent",
      business_name: "SmileCare Dental Clinic",
      status: "active",
      total_calls: 142,
      total_minutes: 318,
      total_credits_used: 89,
      llm_model: "google/gemma-4-31b-it",
      voice: "priya",
      language: "en-IN",
      created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      system_prompt: "You are a helpful dental clinic receptionist named Priya. You help patients schedule appointments, answer questions about services, and provide clinic information in a warm and professional manner.",
      greeting_message: "Hello, welcome to SmileCare Dental Clinic. How can I help you today?",
    };
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-xs text-[#9d61ff] font-medium">
          <span className="w-2 h-2 rounded-full bg-[#9d61ff] animate-pulse inline-block" />
          This is a live preview — <Link href="/register" className="underline text-white/70 hover:text-white ml-1">sign up free</Link> to create your own voice agent
        </div>
        <GuestGate isGuest={true} featureName="Agent Details">
          <AgentDetailContent agent={demoAgent} sources={[]} recentCalls={[]} id="demo" isGuest={true} />
        </GuestGate>
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (!agent) notFound();

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, type, name, status")
    .eq("agent_id", id)
    .order("created_at", { ascending: false });

  const { data: recentCalls } = await supabase
    .from("calls")
    .select("id, status, duration_seconds, credits_used, started_at")
    .eq("agent_id", id)
    .order("started_at", { ascending: false })
    .limit(5);

  return (
    <div className="animate-fade-in">
      <AgentDetailContent agent={agent} sources={sources} recentCalls={recentCalls} id={id} isGuest={false} />
    </div>
  );
}
