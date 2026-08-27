import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import { BarChart3, TrendingUp, Phone, Clock, Zap, Bot } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";
import GuestPromo from "@/components/dashboard/GuestPromo";

export default async function AnalyticsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return (
      <GuestGate isGuest={true} featureName="Analytics">
        <GuestPromo
          icon="analytics"
          title="Sign in to view analytics"
          description="Call volumes, minutes, and usage across all your agents."
        />
      </GuestGate>
    );
  }
  const supabase = createAdminClient();

  const [agentsRes, callsRes] = await Promise.all([
    supabase.from("agents").select("id, name, total_calls, total_minutes, total_credits_used, status").eq("user_id", session.userId).neq("status", "deleted"),
    supabase.from("calls").select("duration_seconds, credits_used, status, started_at").eq("user_id", session.userId).order("started_at", { ascending: false }).limit(100),
  ]);

  const agents = agentsRes.data || [];
  const calls = callsRes.data || [];

  const totalCalls = calls.length;
  const completedCalls = calls.filter(c => c.status === "completed").length;
  const totalMinutes = Math.ceil(calls.reduce((s, c) => s + c.duration_seconds, 0) / 60);
  const totalCredits = calls.reduce((s, c) => s + (c.credits_used || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.ceil(calls.reduce((s, c) => s + c.duration_seconds, 0) / totalCalls) : 0;
  const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

  const topAgents = [...agents].sort((a, b) => b.total_calls - a.total_calls).slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-[#9d61ff]" />
          Analytics
        </h1>
        <p className="text-white/40 text-sm mt-0.5">Usage overview across all your agents</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Calls", value: totalCalls, icon: Phone, color: "#10b981" },
          { label: "Total Minutes", value: totalMinutes, icon: Clock, color: "#00E5FF" },
          { label: "Credits Used", value: totalCredits, icon: Zap, color: "#9d61ff" },
          { label: "Completion Rate", value: `${completionRate}%`, icon: TrendingUp, color: "#f59e0b" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-xs text-white/40">{label}</span>
            </div>
            <div className="font-display font-bold text-2xl text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#9d61ff]" />
            Top Agents by Usage
          </h2>
          {topAgents.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-6">No agent data yet.</p>
          ) : (
            <div className="space-y-3">
              {topAgents.map((agent, i) => {
                const maxCalls = topAgents[0]?.total_calls || 1;
                const pct = (agent.total_calls / maxCalls) * 100;
                return (
                  <div key={agent.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70 flex items-center gap-2">
                        <span className="text-[#9d61ff] font-mono text-xs">#{i + 1}</span>
                        {agent.name}
                      </span>
                      <span className="text-white/40">{agent.total_calls} calls</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Avg Call Duration */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#00E5FF]" />
            Call Statistics
          </h2>
          <div className="space-y-4">
            {[
              { label: "Average Call Duration", value: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` },
              { label: "Completed Calls", value: completedCalls },
              { label: "In-Progress / Active", value: calls.filter(c => c.status === "in-progress").length },
              { label: "Active Agents", value: agents.filter(a => a.status === "active").length },
              { label: "Total Agents", value: agents.length },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <span className="text-sm text-white/50">{label}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coming soon chart placeholder */}
      <div className="glass-card rounded-2xl p-8 text-center border-dashed border-white/[0.07]">
        <BarChart3 className="w-8 h-8 text-white/15 mx-auto mb-3" />
        <p className="text-white/30 text-sm">Usage charts and trends coming soon.</p>
      </div>
    </div>
  );
}
