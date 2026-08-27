"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Bot, Plus, BookOpen, Phone, PhoneCall, BarChart3,
  CreditCard, Settings, LogOut, Menu, X, Zap
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "My Agents", icon: Bot },
  { href: "/dashboard/create", label: "Create Agent", icon: Plus, highlight: true },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/calls", label: "Calls", icon: Phone },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: PhoneCall },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/credits", label: "Credits", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface Props {
  userName?: string;
  userEmail?: string;
  isGuest?: boolean;
  onOpenAuth?: () => void;
}

export default function DashboardSidebar({ userName = "", userEmail = "", isGuest = false, onOpenAuth }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"
      >
        <Menu className="w-5 h-5 text-white" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        w-64 bg-[#0a0a10] border-r border-white/[0.05] flex flex-col
        transition-transform duration-300 lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Mobile close */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 lg:hidden w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-white text-sm">Yantric</div>
              <div className="text-[10px] text-white/30 font-medium">AI Voice Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
          {navItems.map(({ href, label, icon: Icon, highlight }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`sidebar-link ${isActive(href) ? "active" : ""} ${
                highlight && !isActive(href)
                  ? "border border-[#7C3AED]/20 text-[#9d61ff] hover:bg-[#7C3AED]/10 hover:border-[#7C3AED]/35"
                  : ""
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {highlight && !isActive(href) && (
                <span className="ml-auto text-[9px] bg-[#7C3AED]/20 text-[#9d61ff] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  New
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 pb-5 border-t border-white/[0.05] pt-4 space-y-2">
          {isGuest ? (
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-center">
                <div className="text-xs font-semibold text-white mb-1">Guest Mode</div>
                <div className="text-[10px] text-white/40 mb-2">Sign in to use all features</div>
                <Link
                  href="/login"
                  className="btn-primary text-xs w-full py-2 flex items-center justify-center gap-1"
                >
                  Sign In / Register
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Credits quick view */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/15">
                <Zap className="w-3.5 h-3.5 text-[#9d61ff] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-white/40">Credits</div>
                  <div className="text-xs font-semibold text-white">Available</div>
                </div>
                <Link href="/dashboard/credits" className="text-[10px] text-[#9d61ff] hover:text-[#7C3AED] font-medium">
                  Buy
                </Link>
              </div>

              {/* User info */}
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shrink-0 text-xs font-bold text-white">
                  {userName?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{userName}</div>
                  <div className="text-[10px] text-white/30 truncate">{userEmail}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
