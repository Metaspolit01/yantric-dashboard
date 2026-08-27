import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import Link from "next/link";
import { Phone, Clock, Zap, Play } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";

function formatDur(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-400",
    "in-progress": "bg-[#00E5FF] animate-pulse",
    missed: "bg-white/20",
    failed: "bg-red-400",
  };
  return <span className={`w-2 h-2 rounded-full inline-block ${colors[status] || "bg-white/20"}`} />;
}

export default async function CallsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return <GuestGate isGuest={true} featureName="Call Logs"><div className="p-8" /></GuestGate>;
  }
  const supabase = createAdminClient();

  const { data: calls } = await supabase
    .from("calls")
    .select("id, status, duration_seconds, credits_used, started_at, ended_at, recording_url, agents(name, business_name)")
    .eq("user_id", session.userId)
    .order("started_at", { ascending: false })
    .limit(100);

  const totalMinutes = (calls || []).reduce((s, c) => s + Math.ceil(c.duration_seconds / 60), 0);
  const totalCredits = (calls || []).reduce((s, c) => s + (c.credits_used || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Call History</h1>
          <p className="text-white/40 text-sm mt-0.5">{calls?.length || 0} calls · {totalMinutes} minutes · {totalCredits} credits used</p>
        </div>
      </div>

      {!calls || calls.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <Phone className="w-10 h-10 text-white/10 mx-auto mb-4" />
          <h2 className="font-display font-bold text-lg text-white mb-2">No calls yet</h2>
          <p className="text-white/35 text-sm">Test your agent to start making calls and see call history here.</p>
          <Link href="/dashboard/agents" className="btn-primary inline-flex items-center gap-2 mt-5 text-sm">
            <Phone className="w-4 h-4" /> Go to Agents
          </Link>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-white/[0.05] text-xs font-semibold text-white/40 uppercase tracking-wider">
            <span>Agent</span>
            <span className="text-right">Date</span>
            <span className="text-right">Duration</span>
            <span className="text-right">Credits</span>
            <span className="text-right">Recording</span>
            <span className="text-right">Status</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/[0.03]">
            {calls.map(call => (
              <div key={call.id} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors items-center">
                <div className="min-w-0">
                  {/* @ts-expect-error – Supabase join */}
                  <div className="text-sm font-medium text-white truncate">{call.agents?.name || "Unknown Agent"}</div>
                  {/* @ts-expect-error – Supabase join */}
                  <div className="text-xs text-white/30 truncate">{call.agents?.business_name || ""}</div>
                </div>
                <div className="text-xs text-white/40 text-right shrink-0">{formatDate(call.started_at)}</div>
                <div className="text-sm text-white/70 text-right shrink-0 flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3 text-white/25" />{formatDur(call.duration_seconds)}
                </div>
                <div className="text-sm text-[#9d61ff] text-right shrink-0 flex items-center justify-end gap-1">
                  <Zap className="w-3 h-3" />{call.credits_used || 0}
                </div>
                <div className="text-right shrink-0">
                  {call.recording_url ? (
                    <audio controls className="h-8 w-32" src={call.recording_url}>
                      <a href={call.recording_url} download className="text-xs text-[#00E5FF] hover:underline flex items-center justify-end gap-1">
                        <Play className="w-3 h-3" /> Play
                      </a>
                    </audio>
                  ) : (
                    <span className="text-xs text-white/30">No recording</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5 shrink-0">
                  <StatusDot status={call.status} />
                  <span className="text-xs text-white/50 capitalize">{call.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
