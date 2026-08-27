"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, PhoneOff, Loader2, AlertCircle, Volume2, Cpu, Terminal } from "lucide-react";
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from "livekit-client";

interface Props {
  agentId: string;
  agentName: string;
}

type CallState = "idle" | "connecting" | "active" | "ended" | "error";

export default function TestAgentWidget({ agentId, agentName }: Props) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<"stopped" | "starting" | "running" | "error" | "unknown">("unknown");

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const workerPollRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupAudio = () => {
    audioElementsRef.current.forEach((el) => { el.pause(); el.remove(); });
    audioElementsRef.current = [];
  };

  // Check worker status via LiveKit health probe
  const checkWorkerStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-process");
      const d = await r.json();
      setWorkerStatus(d.status === "running" ? "running" : "stopped");
    } catch {
      setWorkerStatus("unknown");
    }
  }, []);

  // Poll status while call is active
  const stopWorkerPoll = useCallback(() => {
    if (workerPollRef.current) { clearInterval(workerPollRef.current); workerPollRef.current = null; }
  }, []);

  const startWorkerPoll = useCallback(() => {
    stopWorkerPoll();
    workerPollRef.current = setInterval(checkWorkerStatus, 3000);
  }, [stopWorkerPoll, checkWorkerStatus]);

  // Check on mount
  useEffect(() => {
    checkWorkerStatus();
  }, [checkWorkerStatus]);

  const endCall = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopWorkerPoll();

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    cleanupAudio();
    setCallState("ended");
    setAgentSpeaking(false);
    setTimeout(() => setCallState("idle"), 3000);
  }, [stopWorkerPoll]);

  const startCall = useCallback(async () => {
    setError("");
    setCallState("connecting");
    setDuration(0);
    startWorkerPoll();

    try {
      const res = await fetch(`/api/agents/${agentId}/test-session`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create test call session.");
        setCallState("error");
        stopWorkerPoll();
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      // Handle incoming audio tracks from agent
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          audioElementsRef.current.push(el);
          document.body.appendChild(el);
          setAgentSpeaking(true);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        setAgentSpeaking(false);
      });

      room.on(RoomEvent.Disconnected, () => {
        endCall();
      });

      // Connect WebRTC to LiveKit server
      await room.connect(data.livekitUrl, data.token);

      // Enable microphone audio input with noise suppression & echo cancellation
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      setCallState("active");

      // Start call timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

    } catch (err: any) {
      console.error("LiveKit connection error:", err);
      setError(err?.message || "WebRTC connection failed. Make sure your microphone is enabled.");
      setCallState("error");
      cleanupAudio();
    }
  }, [agentId, endCall]);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const newMute = !muted;
    setMuted(newMute);
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMute);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (workerPollRef.current) clearInterval(workerPollRef.current);
      if (roomRef.current) roomRef.current.disconnect();
      cleanupAudio();
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-6">

      {/* Worker offline banner */}


      {/* Visual Orb */}
      <div className="relative flex items-center justify-center w-40 h-40">
        {callState === "active" && (
          <>
            <div className="absolute inset-0 rounded-full border border-[#7C3AED]/20 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="absolute inset-[-12px] rounded-full border border-[#7C3AED]/10" style={{ animation: "ping 3s ease-in-out infinite" }} />
          </>
        )}

        <motion.div
          className="w-32 h-32 rounded-full flex items-center justify-center cursor-pointer relative"
          style={{
            background: callState === "active"
              ? "radial-gradient(circle at 35% 35%, rgba(124,58,237,0.4), rgba(59,130,246,0.2) 60%, rgba(6,6,8,0.9) 100%)"
              : callState === "connecting"
                ? "radial-gradient(circle at 35% 35%, rgba(124,58,237,0.2), rgba(59,130,246,0.1) 60%, rgba(6,6,8,0.9) 100%)"
                : "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 60%, rgba(6,6,8,0.9) 100%)",
            border: callState === "active"
              ? "1px solid rgba(124,58,237,0.5)"
              : "1px solid rgba(255,255,255,0.08)",
            boxShadow: callState === "active"
              ? "0 0 60px rgba(124,58,237,0.3), 0 0 120px rgba(124,58,237,0.1)"
              : "none",
          }}
          animate={callState === "active" ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          onClick={callState === "idle" || callState === "error" ? startCall : undefined}
        >
          {callState === "active" && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-[3px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[3.5px] rounded-full bg-gradient-to-t from-[#7C3AED] to-[#00E5FF]"
                    animate={{
                      height: agentSpeaking
                        ? [`${8 + Math.sin(i) * 5}px`, `${24 + Math.sin(i * 1.8) * 12}px`, `${8 + Math.sin(i) * 5}px`]
                        : ["6px", "12px", "6px"],
                    }}
                    transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }}
                  />
                ))}
              </div>
              {agentSpeaking && (
                <span className="text-[9px] font-bold text-[#00E5FF] flex items-center gap-1 uppercase tracking-wider">
                  <Volume2 className="w-3 h-3" /> Speaking
                </span>
              )}
            </div>
          )}

          {callState === "connecting" && (
            <Loader2 className="w-8 h-8 text-[#9d61ff] animate-spin" />
          )}

          {(callState === "idle" || callState === "error") && (
            <div className="flex flex-col items-center gap-2">
              <Mic className="w-8 h-8 text-white/40" />
              <span className="text-[10px] text-white/25 font-medium">Click to call agent</span>
            </div>
          )}

          {callState === "ended" && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-green-400 text-2xl">✓</div>
              <span className="text-[10px] text-white/40">Call ended</span>
            </div>
          )}
        </motion.div>
      </div>

      {/* Status Text */}
      <AnimatePresence mode="wait">
        <motion.div
          key={callState}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-center"
        >
          {callState === "idle" && (
            <div>
              <p className="text-white font-semibold">{agentName}</p>
              <p className="text-white/35 text-xs mt-0.5">Click Start Call to test your agent</p>
            </div>
          )}
          {callState === "connecting" && (
            <div>
              <p className="text-white/70 font-medium">Connecting WebRTC Audio…</p>
              <p className="text-white/30 text-xs mt-0.5">Joining LiveKit room</p>
            </div>
          )}
          {callState === "active" && (
            <div>
              <p className="text-white font-semibold text-green-400">● Live Voice Conversation</p>
              <p className="text-white/40 text-sm mt-0.5 font-mono">{formatDuration(duration)}</p>
            </div>
          )}
          {callState === "ended" && (
            <div>
              <p className="text-white/60 font-medium">Call ended</p>
              <p className="text-white/30 text-xs mt-0.5">Duration: {formatDuration(duration)}</p>
            </div>
          )}
          {callState === "error" && (
            <div className="flex items-center gap-2 text-red-400 max-w-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs leading-relaxed">{error}</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Call Actions */}
      <div className="flex items-center gap-3">
        {callState === "idle" || callState === "error" ? (
          <button
            onClick={startCall}
            className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-[#7C3AED]/30"
          >
            <Mic className="w-4 h-4" />
            Start Voice Test Call
          </button>
        ) : callState === "active" ? (
          <>
            <button
              onClick={toggleMute}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all ${muted
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "bg-white/[0.04] border-white/10 text-white/60 hover:text-white"
                }`}
              title={muted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={endCall}
              className="btn-danger flex items-center gap-2 px-5 py-2.5"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </button>
          </>
        ) : null}
      </div>

      {/* Worker status badge */}
      {(callState === "connecting" || callState === "active") && (
        <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${workerStatus === "running"
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : workerStatus === "error"
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-[#7C3AED]/10 border-[#7C3AED]/20 text-[#9d61ff]"
          }`}>
          <Cpu className="w-3 h-3" />
          {workerStatus === "running" ? "Agent Worker: Active" :
            workerStatus === "error" ? "Agent Worker: Failed" :
              "Agent Worker: Starting…"}
        </div>
      )}
    </div>
  );
}
