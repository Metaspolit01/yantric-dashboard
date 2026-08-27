import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import GuestGate from "@/components/dashboard/GuestGate";
import CreditsClient from "./CreditsClient";

export default async function CreditsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return <GuestGate isGuest={true} featureName="Credits"><div className="p-8" /></GuestGate>;
  }
  const supabase = createAdminClient();

  const [profileRes, txRes] = await Promise.all([
    supabase.from("profiles").select("credits, plan").eq("id", session.userId).single(),
    supabase.from("credit_transactions").select("*").eq("user_id", session.userId).order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <CreditsClient
      initialCredits={profileRes.data?.credits ?? 0}
      initialPlan={profileRes.data?.plan ?? "free"}
      initialTransactions={txRes.data ?? []}
    />
  );
}
