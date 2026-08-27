import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import Link from "next/link";
import { Bot, Plus, Phone, Clock, Zap, MoreHorizontal } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";
import GuestPromo from "@/components/dashboard/GuestPromo";

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; dot: string }> = {
    active: { cls: "badge-active", dot: "bg-green-400" },
    paused: { cls: "badge-paused", dot: "bg-amber-400" },
    deleted: { cls: "badge-deleted", dot: "bg-red-400" },
  };
  const s = cfg[status] || cfg.paused;
  return (
    <span className={s.cls}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default async function AgentsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return (
      <GuestGate isGuest={true} featureName="My Agents">
        <GuestPromo
          icon="agents"
          title="Sign in to view your agents"
          description="Create, configure, and test your AI voice agents."
        />
      </GuestGate>
    );
  }
  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, business_name, status, total_calls, total_minutes, total_credits_used, created_at, language, voice")
    .eq("user_id", session.userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">My Agents</h1>
          <p className="text-white/40 text-sm mt-0.5">{agents?.length || 0} agent{agents?.length !== 1 ? "s" : ""} total</p>
        </div>
        <Link href="/dashboard/create" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Agent
        </Link>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#7C3AED]/10 border border-[#7C3AED]/15 flex items-center justify-center mx-auto mb-5">
            <Bot className="w-7 h-7 text-[#9d61ff]" />
          </div>
          <h2 className="font-display font-bold text-xl text-white mb-2">No agents yet</h2>
          <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
            Create your first AI voice agent in minutes. Just answer a few questions about your business.
          </p>
          <Link href="/dashboard/create" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Your First Agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} className="glass-card rounded-2xl p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/20 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-[#9d61ff]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white text-sm truncate">{agent.name}</div>
                    <div className="text-xs text-white/35 truncate">{agent.business_name}</div>
                  </div>
                </div>
                <StatusBadge status={agent.status} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2.5 text-center">
                  <Phone className="w-3.5 h-3.5 text-white/30 mx-auto mb-1" />
                  <div className="text-sm font-bold text-white">{agent.total_calls}</div>
                  <div className="text-[9px] text-white/30">Calls</div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2.5 text-center">
                  <Clock className="w-3.5 h-3.5 text-white/30 mx-auto mb-1" />
                  <div className="text-sm font-bold text-white">{agent.total_minutes}</div>
                  <div className="text-[9px] text-white/30">Minutes</div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2.5 text-center">
                  <Zap className="w-3.5 h-3.5 text-white/30 mx-auto mb-1" />
                  <div className="text-sm font-bold text-white">{agent.total_credits_used}</div>
                  <div className="text-[9px] text-white/30">Credits</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-white/[0.05]">
                <Link
                  href={`/dashboard/agents/${agent.id}`}
                  className="flex-1 btn-primary text-xs text-center flex items-center justify-center gap-1.5 py-2"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Test Agent
                </Link>
                <Link
                  href={`/dashboard/agents/${agent.id}/knowledge`}
                  className="flex-1 btn-ghost text-xs text-center flex items-center justify-center gap-1.5 py-2"
                >
                  Knowledge
                </Link>
                <Link
                  href={`/dashboard/agents/${agent.id}/edit`}
                  className="w-9 btn-ghost text-xs flex items-center justify-center py-2 px-0"
                  title="Edit"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
