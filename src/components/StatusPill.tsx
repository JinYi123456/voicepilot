"use client";

import { AgentStatus } from "@/lib/voice-agent-client";

const STATUS_META: Record<AgentStatus, { label: string; dot: string; text: string }> = {
  idle: { label: "Idle", dot: "bg-zinc-500", text: "text-zinc-400" },
  connecting: { label: "Connecting...", dot: "bg-warn animate-pulse", text: "text-warn" },
  ready: { label: "Ready", dot: "bg-accent", text: "text-accent" },
  listening: { label: "Listening...", dot: "bg-accent animate-pulse", text: "text-accent" },
  agent_speaking: { label: "Agent speaking... (interruptible)", dot: "bg-accent2 animate-pulse", text: "text-accent2" },
  tool_running: { label: "Running tool...", dot: "bg-warn animate-pulse", text: "text-warn" },
  ended: { label: "Call ended", dot: "bg-zinc-500", text: "text-zinc-400" },
  error: { label: "Error", dot: "bg-danger", text: "text-danger" },
};

export function StatusPill({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium ${meta.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
