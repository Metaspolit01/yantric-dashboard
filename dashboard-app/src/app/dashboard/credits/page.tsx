import { getOptionalSession } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase-admin";
import Link from "next/link";
import { Zap, TrendingDown, ArrowUpRight } from "lucide-react";
import GuestGate from "@/components/dashboard/GuestGate";

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

  const credits = profileRes.data?.credits ?? 0;
  const plan = profileRes.data?.plan ?? "free";
  const transactions = txRes.data || [];

  const creditsUsed = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const plans = [
    { id: "starter", name: "Starter", credits: "1,000", price: "₹999/mo", desc: "Perfect for small businesses", highlight: false },
    { id: "business", name: "Business", credits: "5,000", price: "₹3,999/mo", desc: "Most popular for growing teams", highlight: true },
    { id: "enterprise", name: "Enterprise", credits: "25,000", price: "₹14,999/mo", desc: "For high-volume operations", highlight: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">Credits</h1>
        <p className="text-white/40 text-sm mt-0.5">2 credits per minute of voice conversation</p>
      </div>

      {/* Balance card */}
      <div className="relative glass-card rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#7C3AED] opacity-[0.08] rounded-full blur-[60px]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-[#9d61ff]" />
            <span className="text-sm text-white/50">Available Balance</span>
            <span className="text-[10px] bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full text-white/30 capitalize">{plan} plan</span>
          </div>
          <div className="font-display font-bold text-5xl text-white mb-1">{credits.toLocaleString()}</div>
          <p className="text-white/35 text-sm">credits remaining · {creditsUsed.toLocaleString()} used total</p>
        </div>
      </div>

      {/* Upgrade plans */}
      <div>
        <h2 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-[#9d61ff]" />
          Get More Credits
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map(p => (
            <div
              key={p.id}
              className={`rounded-2xl p-5 border transition-all cursor-pointer hover:border-[#7C3AED]/40 ${
                p.highlight
                  ? "border-[#7C3AED]/30 bg-[#7C3AED]/10"
                  : "border-white/[0.07] bg-white/[0.02]"
              }`}
            >
              {p.highlight && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#9d61ff] mb-2">Most Popular</div>
              )}
              <div className="font-display font-bold text-white text-lg">{p.name}</div>
              <div className="text-2xl font-display font-bold text-white mt-1">{p.credits}</div>
              <div className="text-xs text-white/40 mb-3">credits · {p.price}</div>
              <div className="text-xs text-white/30 mb-4">{p.desc}</div>
              <button className={p.highlight ? "btn-primary w-full text-sm py-2" : "btn-ghost w-full text-sm py-2"}>
                Upgrade
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/25 mt-3">Credit purchases coming soon. Contact us at hello@yantric.ai to purchase credits.</p>
      </div>

      {/* Transaction history */}
      <div className="glass-card rounded-2xl">
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h2 className="font-display font-semibold text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#9d61ff]" />
            Transaction History
          </h2>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-white/30 text-sm">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {transactions.map(tx => (
              <div key={tx.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? "bg-green-500/10" : "bg-[#7C3AED]/10"}`}>
                  <Zap className={`w-3.5 h-3.5 ${tx.amount > 0 ? "text-green-400" : "text-[#9d61ff]"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 truncate">{tx.description}</div>
                  <div className="text-xs text-white/30">{new Date(tx.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
                <div className={`text-sm font-semibold shrink-0 ${tx.amount > 0 ? "text-green-400" : "text-white/60"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
