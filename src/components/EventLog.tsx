"use client";

import { useEffect, useRef } from "react";

export function EventLog({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={ref}
      className="h-28 overflow-y-auto rounded-xl border border-line bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-500"
    >
      {logs.length === 0 ? (
        <p className="text-zinc-700">WebSocket event log will appear here…</p>
      ) : (
        logs.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      )}
    </div>
  );
}
