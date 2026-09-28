"use client";

import { WireDebug } from "@/lib/voice-agent-client";

function Section({ title, mono, children }: { title: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-black/30 p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-zinc-400 ${mono ? "font-mono" : ""}`}>
        {children}
      </pre>
    </div>
  );
}

/**
 * Fixed wire-level debug panel: exactly what the browser sends, what the
 * server echoes back, every raw error, and the host we actually connected to.
 */
export function WireDebugPanel({ debug }: { debug: WireDebug }) {
  if (!debug.sessionUpdate && !debug.sessionReadyConfig && !debug.error && !debug.wsHost) {
    return null;
  }

  return (
    <details className="rounded-xl border border-accent2/30 bg-panel/60 open:bg-panel" open>
      <summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold text-accent2">
        Wire Debug（发给服务器的 session.update / 服务端 config 回显 / 原始错误）
      </summary>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <Section title="① session.update (sent verbatim)" mono>
          {debug.sessionUpdate ?? "— not sent yet —"}
        </Section>
        <Section title="② session.ready config echo" mono>
          {debug.sessionReadyConfig ?? "— waiting —"}
        </Section>
        <Section title="③ WebSocket host" mono>
          {debug.wsHost ?? "—"}
        </Section>
        <Section title="④ session.error (raw)" mono>
          {debug.error ?? "— none received —"}
        </Section>
      </div>
      {debug.turnDetection && (
        <div className="border-t border-line px-3 py-2 text-[11px] text-zinc-400">
          <span className="font-semibold text-accent2">Turn detection being sent:</span>{" "}
          <code className="font-mono">{debug.turnDetection}</code>
        </div>
      )}
    </details>
  );
}
