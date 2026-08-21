import { getOptionalSession } from "@/lib/guards";
import DashboardSidebar from "@/components/dashboard/Sidebar";
import TopHeader from "@/components/dashboard/TopHeader";
import { createAdminClient } from "@/lib/supabase-admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  const isGuest = !session;

  let credits = 100;
  if (session) {
    const supabase = createAdminClient();
    const { data } = await supabase.from("profiles").select("credits").eq("id", session.userId).single();
    if (data?.credits !== undefined) {
      credits = data.credits;
    }
  }

  return (
    <div className="min-h-screen bg-[#060608] flex">
      <DashboardSidebar
        userName={session?.name}
        userEmail={session?.email}
        isGuest={isGuest}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <TopHeader
            userName={session?.name}
            userEmail={session?.email}
            credits={credits}
            isGuest={isGuest}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
