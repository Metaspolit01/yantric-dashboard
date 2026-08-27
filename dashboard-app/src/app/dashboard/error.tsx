"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-segment error boundary for /dashboard/*.
 * Without this, a thrown server error renders as a blank page —
 * this surfaces the message instead (spec §27: visible error states).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="glass-card rounded-2xl p-10 max-w-lg mx-auto mt-12 text-center animate-fade-in">
      <AlertTriangle className="w-10 h-10 text-amber-400/80 mx-auto mb-4" />
      <h2 className="font-display font-bold text-lg text-white mb-2">Something went wrong</h2>
      <p className="text-white/40 text-sm mb-1">This section failed to load.</p>
      {error?.digest && (
        <p className="text-white/25 text-[11px] font-mono mb-4">ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="btn-primary inline-flex items-center gap-2 text-sm mx-auto"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}
