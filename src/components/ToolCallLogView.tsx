"use client";

import { ToolCallLog } from "@/lib/voice-agent-client";

const WRITE_TOOLS = new Set(["confirm_booking", "reschedule_booking", "cancel_booking"]);

function nameColor(name: string): string {
  if (WRITE_TOOLS.has(name)) return "bg-accent/20 text-accent";
  if (name === "save_call_summary") return "bg-accent2/20 text-accent2";
  return "bg-accent2/15 text-accent2";
}

/** Parse the post-write verification verdict out of the JSON result, if any. */
function verifiedBadge(c: ToolCallLog) {
  if (!WRITE_TOOLS.has(c.name)) return null;
  try {
    const r = JSON.parse(c.result) as { verified?: boolean };
    if (typeof r.verified !== "boolean") return null;
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
          r.verified ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"
        }`}
      >
        {r.verified ? "✓ verified" : "✗ unverified"}
      </span>
    );
  } catch {
    return null;
  }
}

/**
 * Tool call inspector — shows each tool invocation with its arguments, JSON
 * result, and (for write tools) the post-write verification verdict. Used
 * inside the Owner View's Activity Log tab.
 */
export function ToolCallLogView({ calls }: { calls: ToolCallLog[] }) {
  if (calls.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel/40 p-6 text-center text-xs text-zinc-600">
        No tool calls yet — they appear here as the agent works
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((c) => {
        const badge = verifiedBadge(c);
        return (
          <div key={c.id} className="rounded-lg bg-zinc-900/70 p-2 font-mono text-[10.5px] leading-relaxed">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${nameColor(c.name)}`}>
                {c.name}
              </span>
              {badge}
              <span className="text-zinc-600">
                {new Date(c.ts).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
            </div>
            <div className="text-zinc-400">
              <span className="text-zinc-600">args:</span> {JSON.stringify(c.args)}
            </div>
            <div className="mt-0.5 text-zinc-500" title={c.result}>
              <span className="text-zinc-600">→</span> {c.result}
            </div>
          </div>
        );
      })}
    </div>
  );
}
