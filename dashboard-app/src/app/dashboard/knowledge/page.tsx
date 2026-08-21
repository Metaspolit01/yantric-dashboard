import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import KnowledgeBaseClient from "./KnowledgeBaseClient";

export default async function KnowledgePage() {
  const session = await getOptionalSession();
  const isGuest = !session;

  let agents: any[] = [];
  if (session) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("agents")
      .select("id, name, business_name")
      .eq("user_id", session.userId)
      .neq("status", "deleted");
    agents = data || [];
  }

  return (
    <KnowledgeBaseClient isGuest={isGuest} initialAgents={agents} />
  );
}
