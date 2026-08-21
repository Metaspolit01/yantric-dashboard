"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Plus, LogIn, User, Sparkles } from "lucide-react";
import AuthModal from "./AuthModal";

interface Props {
  userName?: string;
  userEmail?: string;
  credits?: number;
  isGuest?: boolean;
}

export default function TopHeader({ userName, userEmail, credits = 100, isGuest = false }: Props) {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <header className="flex items-center justify-between gap-4 pb-6 border-b border-white/[0.08] mb-6 flex-wrap">
      {/* Left side info */}
      <div className="flex items-center gap-3">
        {!isGuest && (
          <div className="flex items-center gap-2 text-xs text-white/50 font-medium">
            <span>Logged in as</span>
            <span className="text-white font-semibold">{userName || userEmail || "User"}</span>
          </div>
        )}
      </div>

      {/* Right side: Credits Widget & Auth */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Top-Right Credits Widget */}
        <Link
          href="/dashboard/credits"
          className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED]/20 via-[#3B82F6]/15 to-[#00E5FF]/10 border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 shadow-lg shadow-[#7C3AED]/10 transition-all group cursor-pointer"
          title="Click to manage or buy voice credits"
        >
          <div className="w-7 h-7 rounded-lg bg-[#7C3AED]/30 border border-[#7C3AED]/40 flex items-center justify-center text-[#9d61ff] group-hover:scale-110 transition-transform">
            <Zap className="w-4 h-4 fill-[#9d61ff]" />
          </div>

          <div className="text-left">
            <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider leading-none mb-0.5">
              Voice Credits
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-sm text-white group-hover:text-[#9d61ff] transition-colors">
                {isGuest ? "100 Free" : credits.toLocaleString()}
              </span>
              <span className="text-[9px] font-bold bg-[#7C3AED]/30 text-[#9d61ff] px-1.5 py-0.2 rounded-full">
                {isGuest ? "Trial" : "Active"}
              </span>
            </div>
          </div>

          <div className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 ml-1">
            <Plus className="w-3 h-3" />
          </div>
        </Link>

        {/* User Account / Sign In Action */}
        {isGuest ? (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="btn-ghost text-xs py-2 px-3.5 border-white/15 text-white/80 hover:text-white flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </Link>
            <Link
              href="/register"
              className="btn-primary text-xs py-2 px-3.5 shadow-lg shadow-[#7C3AED]/20 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Create Account
            </Link>
          </div>
        ) : (
          <Link
            href="/dashboard/settings"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center text-xs font-bold text-white shadow-md shadow-[#7C3AED]/20 hover:scale-105 transition-transform"
            title="Settings & Profile"
          >
            {userName?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
          </Link>
        )}
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="login"
        featureName="Voice Credits"
      />
    </header>
  );
}
