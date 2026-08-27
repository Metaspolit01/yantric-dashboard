import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import GuestGate from "@/components/dashboard/GuestGate";
import GuestPromo from "@/components/dashboard/GuestPromo";
import CampaignsClient from "@/components/dashboard/CampaignsClient";

export default async function CampaignsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return (
      <GuestGate isGuest={true} featureName="Outbound Campaigns">
        <GuestPromo
          icon="campaigns"
          title="Sign in to run campaigns"
          description="Upload contact sheets and let your agent dial and log every call."
        />
      </GuestGate>
    );
  }

  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("user_id", session.userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">Outbound Campaigns</h1>
        <p className="text-white/40 text-sm mt-0.5">
          Upload a contact sheet — your agent calls every number and logs each conversation here.
        </p>
      </div>

      <CampaignsClient
        agents={(agents || []).map((a) => ({ id: a.id, name: a.name }))}
        userName={session.name}
      />
    </div>
  );
}
