"use client";

import { useEffect, useRef } from "react";
import { ChatEntry } from "@/hooks/useVoiceAgent";

/**
 * Live transcript pane — the demo's left-stage visual focus.
 * Finalized turns stack up; the in-flight partial renders on top with a
 * blinking typewriter cursor.
 */
export function TranscriptPane({
  entries,
  userPartial,
  agentPartial,
}: {
  entries: ChatEntry[];
  userPartial: string;
  agentPartial: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, userPartial, agentPartial]);

  const hasPartial = userPartial.length > 0 || agentPartial.length > 0;

  return (
    <div
      ref={scrollRef}
      className="h-full space-y-3 overflow-y-auto rounded-2xl border border-line bg-panel/70 p-4"
    >
      {entries.length === 0 && !hasPartial && (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
          <span className="text-3xl">🎙️</span>
          <p>Click &quot;Start Call&quot; to begin the live voice conversation</p>
          <p className="text-xs text-zinc-600">
            Feel free to mix English, Chinese and Malay — the agent understands it all
          </p>
        </div>
      )}

      {entries.map((e) =>
        e.role === "user" ? (
          <div key={e.id} className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-800/70 px-3.5 py-2 text-sm text-zinc-200">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Caller
              </span>
              {e.text}
            </div>
          </div>
        ) : (
          <div key={e.id} className="flex justify-end">
            <div
              className={`max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm ${
                e.interrupted
                  ? "border border-warn/30 bg-warn/5 text-zinc-300"
                  : "border border-accent/20 bg-accent/10 text-zinc-100"
              }`}
            >
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-accent/70">
                VoicePilot{e.interrupted ? " (interrupted)" : ""}
              </span>
              {e.text}
            </div>
          </div>
        ),
      )}

      {hasPartial && (
        <div className="space-y-2">
          {userPartial && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-700/60 bg-zinc-800/40 px-3.5 py-2 text-sm text-zinc-400 typewriter-cursor">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Caller
                </span>
                {userPartial}
              </div>
            </div>
          )}
          {agentPartial && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/30 bg-accent/5 px-3.5 py-2 text-sm text-zinc-200 typewriter-cursor">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-accent/70">
                  VoicePilot
                </span>
                {agentPartial}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
