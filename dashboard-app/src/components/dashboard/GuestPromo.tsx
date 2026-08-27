"use client";

import { CreditCard, BarChart3, Settings, Phone, PhoneCall, Bot, BookOpen } from "lucide-react";

const ICONS = {
  credits: CreditCard,
  analytics: BarChart3,
  settings: Settings,
  calls: Phone,
  campaigns: PhoneCall,
  agents: Bot,
  knowledge: BookOpen,
} as const;

export type GuestPromoIcon = keyof typeof ICONS;

/**
 * Visible sign-in prompt shown to guests on gated dashboard pages.
 * Clicking anywhere opens the AuthModal via GuestGate's overlay.
 * (Icon is mapped internally so this can render from server components.)
 */
export default function GuestPromo({
  icon,
  title,
  description,
}: {
  icon: GuestPromoIcon;
  title: string;
  description: string;
}) {
  const Icon = ICONS[icon] ?? Bot;
  return (
    <div className="glass-card rounded-2xl p-12 max-w-md mx-auto mt-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/10 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-[#9d61ff]" />
      </div>
      <h2 className="font-display font-bold text-lg text-white mb-2">{title}</h2>
      <p className="text-white/40 text-sm mb-3">{description}</p>
      <p className="text-xs text-[#9d61ff]/80 font-medium">
        Click anywhere here to sign in or create a free account →
      </p>
    </div>
  );
}
