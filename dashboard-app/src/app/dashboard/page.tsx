import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import Link from "next/link";
import { Bot, Phone, Zap, Clock, Plus, ArrowRight, TrendingUp } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const session = await getOptionalSession();
  const isGuest = !session;

  let profile = null;
  let agents: any[] = [];
  let calls: any[] = [];

  if (session) {
    const supabase = createAdminClient();
    const [profileRes, agentsRes, callsRes] = await Promise.all([
      supabase.from("profiles").select("credits, name").eq("id", session.userId).single(),
      supabase.from("agents").select("id, name, business_name, status, total_calls, total_minutes, total_credits_used, created_at").eq("user_id", session.userId).neq("status", "deleted").order("created_at", { ascending: false }),
      supabase.from("calls").select("id, status, duration_seconds, credits_used, started_at, agents(name)").eq("user_id", session.userId).order("started_at", { ascending: false }).limit(5),
    ]);
    profile = profileRes.data;
    agents = agentsRes.data || [];
    calls = callsRes.data || [];
  }

  const activeAgents = agents.filter(a => a.status === "active").length;
  const totalCalls = agents.reduce((s, a) => s + (a.total_calls || 0), 0);
  const totalMinutes = agents.reduce((s, a) => s + (a.total_minutes || 0), 0);
  const totalCreditsUsed = agents.reduce((s, a) => s + (a.total_credits_used || 0), 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const stats = [
    { label: "Credits Remaining", value: isGuest ? "—" : (profile?.credits ?? 0).toLocaleString(), icon: Zap, color: "#9d61ff", bg: "rgba(124,58,237,0.1)" },
    { label: "Active Agents", value: isGuest ? "—" : activeAgents, icon: Bot, color: "#00E5FF", bg: "rgba(0,229,255,0.08)" },
    { label: "Total Calls", value: isGuest ? "—" : totalCalls, icon: Phone, color: "#10b981", bg: "rgba(16,185,129,0.08)" },
    { label: "Total Minutes", value: isGuest ? "—" : totalMinutes, icon: Clock, color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/40 text-sm mb-1">{greeting()}</p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-white">
            {isGuest ? "Yantric Dashboard" : (profile?.name || session?.name)} <span className="text-white/20">👋</span>
          </h1>
          {isGuest && (
            <p className="text-white/40 text-sm mt-1">
              You are browsing as a guest.{" "}
              <Link href="/login" className="text-[#9d61ff] hover:underline">Sign in</Link>{" "}
              to access your account.
            </p>
          )}
        </div>

        {!isGuest && (
          <Link href="/dashboard/create" className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Create Voice Agent
          </Link>
        )}
      </div>

      {/* Stats grid - visible to all, values hidden for guests */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-xs text-white/40 font-medium">{label}</span>
            </div>
            <div className="font-display font-bold text-2xl text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Agents */}
        <GuestGate isGuest={isGuest} featureName="My Agents">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#9d61ff]" />
                My Agents
              </h2>
              <Link href="/dashboard/agents" className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {agents.length === 0 ? (
              <div className="text-center py-10">
                <Bot className="w-8 h-8 text-white/15 mx-auto mb-3" />
                <p className="text-white/40 text-sm mb-4">No agents yet</p>
                <Link href="/dashboard/create" className="btn-primary text-xs px-4 py-2">
                  Create your first agent
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {agents.slice(0, 4).map(agent => (
                  <Link key={agent.id} href={`/dashboard/agents/${agent.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/20 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-[#9d61ff]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate group-hover:text-[#9d61ff] transition-colors">{agent.name}</div>
                      <div className="text-xs text-white/35 truncate">{agent.business_name}</div>
                    </div>
                    <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${agent.status === "active" ? "badge-active" : "badge-paused"}`}>
                      {agent.status}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </GuestGate>

        {/* Recent Calls */}
        <GuestGate isGuest={isGuest} featureName="Recent Calls">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#00E5FF]" />
                Recent Calls
              </h2>
              <Link href="/dashboard/calls" className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {calls.length === 0 ? (
              <div className="text-center py-10">
                <Phone className="w-8 h-8 text-white/15 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No calls yet</p>
                <p className="text-white/25 text-xs mt-1">Test your agent to see calls here</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {calls.map((call) => (
                  <div key={call.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      call.status === "completed" ? "bg-green-400" :
                      call.status === "in-progress" ? "bg-[#00E5FF] animate-pulse" :
                      "bg-white/20"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/80 truncate">{(call as any).agents?.name || "Unknown Agent"}</div>
                      <div className="text-xs text-white/30">{formatDate(call.started_at)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-white/60">{formatDuration(call.duration_seconds)}</div>
                      <div className="text-[10px] text-[#9d61ff]">{call.credits_used} cr</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GuestGate>
      </div>

      {/* Usage summary - only for logged in users with usage */}
      {!isGuest && totalCreditsUsed > 0 && (
        <div className="glass-card rounded-2xl p-5 animate-fade-in-delay">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#9d61ff]" />
            <h2 className="font-display font-semibold text-white">Usage Summary</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="font-display font-bold text-xl text-white">{totalCalls}</div>
              <div className="text-xs text-white/40 mt-0.5">Total Calls</div>
            </div>
            <div className="text-center border-x border-white/[0.06]">
              <div className="font-display font-bold text-xl text-white">{totalMinutes}</div>
              <div className="text-xs text-white/40 mt-0.5">Minutes Used</div>
            </div>
            <div className="text-center">
              <div className="font-display font-bold text-xl text-white">{totalCreditsUsed}</div>
              <div className="text-xs text-white/40 mt-0.5">Credits Used</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
