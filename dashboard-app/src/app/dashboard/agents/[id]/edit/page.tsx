import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import EditAgentClient from "./EditAgentClient";

type Params = { params: Promise<{ id: string }> };

export default async function EditAgentPage({ params }: Params) {
  const session = await getOptionalSession();
  const { id } = await params;

  if (!session) {
    notFound();
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (!agent) notFound();

  return <EditAgentClient agent={agent} />;
}
