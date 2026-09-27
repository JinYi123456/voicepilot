"use client";

import { ToolCallLog } from "@/lib/voice-agent-client";

/**
 * Tool call inspector — shows each check_availability / confirm_booking
 * invocation with its arguments and JSON result. Compact for the demo.
 */
export function ToolCallLogView({ calls }: { calls: ToolCallLog[] }) {
  if (calls.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Tool Calls
      </div>
      <div className="space-y-2">
        {calls.map((c) => (
          <div key={c.id} className="rounded-lg bg-zinc-900/70 p-2 font-mono text-[10.5px] leading-relaxed">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                  c.name === "confirm_booking"
                    ? "bg-accent/20 text-accent"
                    : "bg-accent2/20 text-accent2"
                }`}
              >
                {c.name}
              </span>
              <span className="text-zinc-600">{new Date(c.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
            </div>
            <div className="text-zinc-400">
              <span className="text-zinc-600">args:</span> {JSON.stringify(c.args)}
            </div>
            <div className="mt-0.5 truncate text-zinc-500" title={c.result}>
              <span className="text-zinc-600">→</span> {c.result}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
