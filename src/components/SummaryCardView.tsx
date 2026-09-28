"use client";

import { CallSummary } from "@/lib/voice-agent-client";

/**
 * End-of-call summary card — filled by the agent's save_call_summary tool
 * (source: "tool") or by the frontend fallback built from the transcript and
 * tool logs when the agent never called it (source: "fallback").
 */
export function SummaryCardView({ summary }: { summary: CallSummary }) {
  const rows: [string, string][] = [
    ["Intent", summary.intent],
    ["Outcome", summary.outcome],
    ["Languages", summary.languages_used.length ? summary.languages_used.join(", ") : "—"],
    ["Next step", summary.next_step],
  ];

  return (
    <div className="animate-card-in rounded-2xl border border-accent2/30 bg-gradient-to-b from-accent2/15 to-panel p-4 shadow-[0_8px_40px_-12px_rgba(139,124,255,0.45)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent2/20 px-2.5 py-1 text-[11px] font-semibold text-accent2">
          📋 Call Summary
        </span>
        <span className="text-[10px] text-zinc-500">
          {summary.source === "tool" ? "saved by agent" : "auto-generated fallback"}
        </span>
      </div>

      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="shrink-0 text-zinc-500">{k}</dt>
            <dd className="text-right font-medium text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
