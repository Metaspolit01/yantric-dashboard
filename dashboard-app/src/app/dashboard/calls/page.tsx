import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import Link from "next/link";
import { Phone, Clock, Zap, Play } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";
import GuestPromo from "@/components/dashboard/GuestPromo";

function DirectionBadge({ direction }: { direction: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "web-test": { label: "Test", cls: "bg-white/[0.06] text-white/40 border-white/10" },
    outbound: { label: "Outbound", cls: "bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/20" },
    inbound: { label: "Inbound", cls: "bg-[#7C3AED]/15 text-[#9d61ff] border-[#7C3AED]/25" },
  };
  const d = map[direction] ?? map["web-test"];
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${d.cls}`}>{d.label}</span>;
}

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
    return (
      <GuestGate isGuest={true} featureName="Call Logs">
        <GuestPromo
          icon="calls"
          title="Sign in to view your calls"
          description="Every conversation with duration, transcript, and credits used."
        />
      </GuestGate>
    );
  }
  const supabase = createAdminClient();

  const { data: calls } = await supabase
    .from("calls")
    .select("id, status, duration_seconds, credits_used, started_at, ended_at, direction, recording_url, caller_phone, agents(name, business_name)")
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
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-white/[0.05] text-xs font-semibold text-white/40 uppercase tracking-wider">
            <span>Agent</span>
            <span className="text-right">Date</span>
            <span className="text-right">Duration</span>
            <span className="text-right">Credits</span>
            <span className="text-right">Status</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/[0.03]">
            {calls.map(call => (
              <div key={call.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {/* @ts-expect-error – Supabase join */}
                      <span className="text-sm font-medium text-white truncate">{call.agents?.name || "Unknown Agent"}</span>
                      <DirectionBadge direction={call.direction || "web-test"} />
                    </div>
                    <div className="text-xs text-white/30 truncate mt-0.5">
                      {/* @ts-expect-error – Supabase join */}
                      {call.caller_phone ? `${call.caller_phone} · ` : ""}{call.agents?.business_name || ""}
                    </div>
                  </div>
                  <div className="text-xs text-white/40 text-right shrink-0">{formatDate(call.started_at)}</div>
                  <div className="text-sm text-white/70 text-right shrink-0 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3 text-white/25" />{formatDur(call.duration_seconds)}
                  </div>
                  <div className="text-sm text-[#9d61ff] text-right shrink-0 flex items-center justify-end gap-1">
                    <Zap className="w-3 h-3" />{call.credits_used || 0}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <StatusDot status={call.status} />
                    <span className="text-xs text-white/50 capitalize">{call.status}</span>
                  </div>
                </div>

                {/* Call recording (real calls only — test calls are never recorded) */}
                {call.recording_url && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9d61ff] shrink-0">
                      <Play className="w-3 h-3" /> Recording
                    </span>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls preload="none" src={call.recording_url} className="h-8 w-full max-w-md" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
