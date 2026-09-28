"use client";

import { MicHealth } from "@/lib/voice-agent-client";

function Meter({ level }: { level: number }) {
  // 10-segment meter
  const filled = Math.round(Math.min(1, Math.max(0, level)) * 10);
  return (
    <span className="tracking-[0.15em] font-mono">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < filled ? "text-accent" : "text-zinc-700"}>
          {i < filled ? "▮" : "▯"}
        </span>
      ))}
    </span>
  );
}

/**
 * Diagnostic status bar — two plain-language checks so a non-technical user
 * can tell whether the failure is at "microphone capture" or "server
 * recognition" without opening DevTools.
 */
export function DiagnosticsBar({
  inCall,
  mic,
  sttActive,
  sttHadResult,
}: {
  inCall: boolean;
  mic: MicHealth | null;
  sttActive: boolean;
  sttHadResult: boolean;
}) {
  if (!inCall) return null;

  const micOk = Boolean(mic?.capturing && mic.level > 0.01);
  const micSilent = Boolean(mic?.capturing && mic.level <= 0.01);
  const trackBad = Boolean(mic && !mic.trackLive);

  return (
    <div className="rounded-xl border border-line bg-panel/80 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        {/* ① microphone capture */}
        <span className="flex items-center gap-2">
          <span className="font-semibold text-zinc-400">① Mic capture:</span>
          {trackBad ? (
            <span className="text-danger">✕ Microphone unavailable — check system permission</span>
          ) : micOk ? (
            <>
              <span className="text-accent">● capturing, level:</span>
              <Meter level={mic!.level} />
            </>
          ) : micSilent ? (
            <span className="text-danger">○ capturing but NO sound detected — mic muted or wrong device?</span>
          ) : (
            <span className="text-zinc-500">… starting</span>
          )}
        </span>

        {/* ② server recognition */}
        <span className="flex items-center gap-2">
          <span className="font-semibold text-zinc-400">② Speech recognition:</span>
          {sttHadResult ? (
            <span className="text-accent">● recognized your speech ✓</span>
          ) : sttActive ? (
            <span className="text-warn animate-pulse">● listening for your speech…</span>
          ) : (
            <span className="text-zinc-500">○ no speech recognized yet</span>
          )}
        </span>
      </div>
    </div>
  );
}
