"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";

interface Props {
  agentId: string;
  status: "active" | "paused" | string;
}

export default function AgentStatusToggle({ agentId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggleStatus = async () => {
    setLoading(true);
    const newStatus = status === "active" ? "paused" : "active";

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        alert("Failed to update agent status.");
      } else {
        router.refresh();
      }
    } catch {
      alert("Network error updating status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggleStatus}
      disabled={loading}
      className={`btn-ghost flex items-center gap-2 text-xs transition-colors ${
        status === "active"
          ? "text-amber-400/80 hover:text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
          : "text-emerald-400/80 hover:text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
      }`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === "active" ? (
        <>
          <PauseCircle className="w-3.5 h-3.5" /> Pause Agent
        </>
      ) : (
        <>
          <PlayCircle className="w-3.5 h-3.5" /> Activate Agent
        </>
      )}
    </button>
  );
}
