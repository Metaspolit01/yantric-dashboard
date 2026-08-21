import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import { Settings, BookOpen } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";

export default async function SettingsPage() {
  const session = await getOptionalSession();
  const isGuest = !session;
  if (isGuest) {
    return <GuestGate isGuest={true} featureName="Settings"><div className="p-8" /></GuestGate>;
  }
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.userId).single();

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#9d61ff]" />
          Settings
        </h1>
        <p className="text-white/40 text-sm mt-0.5">Manage your account</p>
      </div>

      {/* Profile */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-4">Account</h2>
        <div className="space-y-3 text-sm">
          {[
            { label: "Name", value: profile?.name || session.name },
            { label: "Email", value: session.email },
            { label: "Plan", value: profile?.plan || "free" },
            { label: "Member since", value: new Date(profile?.created_at || "").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <span className="text-white/45">{label}</span>
              <span className="text-white/80 capitalize">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="glass-card rounded-2xl p-5 border-red-500/10">
        <h2 className="font-semibold text-white/60 mb-4 text-sm uppercase tracking-wider">Danger Zone</h2>
        <button className="btn-danger text-sm">Delete Account</button>
        <p className="text-xs text-white/25 mt-2">This will permanently delete all your agents, knowledge, and call history.</p>
      </div>

      {/* Support */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#9d61ff]" />
          Support
        </h2>
        <p className="text-sm text-white/45">Need help? Contact us at <a href="mailto:hello@yantric.ai" className="text-[#9d61ff] hover:underline">hello@yantric.ai</a></p>
      </div>
    </div>
  );
}
