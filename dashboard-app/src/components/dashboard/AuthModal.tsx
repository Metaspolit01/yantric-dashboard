"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Bot, Loader2, Sparkles, X, CheckCircle2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
  featureName?: string | null;
}

export default function AuthModal({ isOpen, onClose, initialMode = "register", featureName }: Props) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (authMode === "register" && form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${authMode === "register" ? "Registration" : "Sign in"} failed.`);
        return;
      }
      onClose();
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-md my-8 relative">

        {/* Top Header Banner */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] p-3.5 px-5 rounded-t-2xl text-white shadow-lg">
          <div className="flex items-center gap-2 font-display font-semibold text-xs tracking-wide uppercase">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{authMode === "register" ? "100 Free Voice Credits" : "Account Access Required"}</span>
          </div>

          {/* Close (X) Button */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white/80 hover:text-white transition-all"
            title="Close modal and view page"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Body */}
        <div className="bg-[#0f101a]/95 backdrop-blur-2xl border border-white/15 rounded-b-2xl p-7 shadow-2xl shadow-purple-950/50">

          {/* Mode Tabs */}
          <div className="flex rounded-xl bg-white/[0.05] p-1 mb-6 border border-white/10">
            <button
              onClick={() => { setAuthMode("register"); setError(""); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === "register"
                  ? "bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white shadow-md"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Create Account
            </button>
            <button
              onClick={() => { setAuthMode("login"); setError(""); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === "login"
                  ? "bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white shadow-md"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Sign In
            </button>
          </div>

          {/* Logo */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#7C3AED]/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-white">
                {authMode === "register" ? "Create Account" : "Sign In Required"}
              </h2>
              <p className="text-white/50 text-xs">
                {authMode === "register" ? "Start building your AI voice agent" : "Access your AI dashboard & agents"}
              </p>
            </div>
          </div>

          {/* Feature prompt message */}
          {featureName && (
            <div className="mb-4 p-3 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs text-purple-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00E5FF] shrink-0" />
              <span>To use <strong>{featureName}</strong>, please sign in or create an account.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {authMode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ravi Kumar"
                  required={authMode === "register"}
                  className="yantric-input bg-white/[0.06] border-white/15 focus:border-[#7C3AED] text-white"
                  suppressHydrationWarning
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="you@company.com"
                required
                className="yantric-input bg-white/[0.06] border-white/15 focus:border-[#7C3AED] text-white"
                suppressHydrationWarning
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder={authMode === "register" ? "Min. 8 characters" : "••••••••"}
                  required
                  className="yantric-input pr-11 bg-white/[0.06] border-white/15 focus:border-[#7C3AED] text-white"
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
              className="btn-primary mt-2 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold shadow-lg shadow-[#7C3AED]/30 hover:shadow-[#7C3AED]/50"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              ) : authMode === "register" ? (
                "Get Started — Free →"
              ) : (
                "Sign In →"
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-white/40 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="hover:text-white underline underline-offset-2"
              >
                Close and explore page →
              </button>
              <span className="text-[11px] text-white/30">100 Free trial credits</span>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
