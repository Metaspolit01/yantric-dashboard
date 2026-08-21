"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Bot, Loader2, Sparkles, X } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed. Check your email and password.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Top banner */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] p-3.5 px-5 rounded-t-2xl text-white shadow-lg">
          <div className="flex items-center gap-2 font-display font-semibold text-xs tracking-wide uppercase">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Welcome Back to Yantric</span>
          </div>
          <Link
            href="/dashboard"
            className="w-7 h-7 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white/80 hover:text-white transition-all"
            title="Explore without account"
          >
            <X className="w-4 h-4" />
          </Link>
        </div>

        {/* Card */}
        <div className="bg-[#0f101a] border border-white/10 rounded-b-2xl p-7 shadow-2xl">
          {/* Logo + title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#7C3AED]/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-white">Sign In</h1>
              <p className="text-white/50 text-xs">Access your AI dashboard & agents</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white/[0.05] p-1 mb-6 border border-white/10">
            <div className="flex-1 py-2 text-xs font-semibold rounded-lg text-center bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white shadow-md">
              Sign In
            </div>
            <Link href="/register" className="flex-1 py-2 text-xs font-semibold rounded-lg text-center text-white/50 hover:text-white transition-colors">
              Create Account
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="you@company.com"
                required
                className="yantric-input"
                suppressHydrationWarning
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                  className="yantric-input pr-11"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold shadow-lg shadow-[#7C3AED]/30"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign In →"}
            </button>

            <div className="text-center">
              <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors">
                Explore without an account →
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
