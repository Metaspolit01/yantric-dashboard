import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import KnowledgeManager from "@/components/dashboard/KnowledgeManager";
import GuestGate from "@/components/dashboard/GuestGate";
import GuestPromo from "@/components/dashboard/GuestPromo";

type Params = { params: Promise<{ id: string }> };

export default async function AgentKnowledgePage({ params }: Params) {
  const session = await getOptionalSession();
  const isGuest = !session;
  const { id } = await params;
  if (isGuest) {
    return (
      <GuestGate isGuest={true} featureName="Knowledge Base">
        <GuestPromo
          icon="knowledge"
          title="Sign in to manage knowledge"
          description="Upload PDFs, websites, and documents your agent learns from."
        />
      </GuestGate>
    );
  }
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, business_name")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (!agent) notFound();

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("agent_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <Link href={`/dashboard/agents/${id}`} className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {agent.name}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-[#9d61ff]" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-white">Knowledge Base</h1>
            <p className="text-white/40 text-sm">{agent.business_name} · {sources?.length || 0} source{sources?.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      <KnowledgeManager agentId={id} initialSources={sources || []} />
    </div>
  );
}
