"use client";

import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { StatusPill } from "@/components/StatusPill";
import { TranscriptPane } from "@/components/TranscriptPane";
import { BookingCardView } from "@/components/BookingCardView";
import { ToolCallLogView } from "@/components/ToolCallLogView";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { EventLog } from "@/components/EventLog";
import { DiagnosticsBar } from "@/components/DiagnosticsBar";
import { WireDebugPanel } from "@/components/WireDebugPanel";

export default function Home() {
  const {
    status,
    error,
    userPartial,
    agentPartial,
    entries,
    toolCalls,
    bookings,
    availability,
    logs,
    micHealth,
    sttActive,
    sttHadResult,
    wireDebug,
    start,
    end,
  } = useVoiceAgent();

  const inCall = status !== "idle" && status !== "ended" && status !== "error";
  const listening = status === "listening" || status === "ready";

  return (
    <main className="grid-backdrop min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-4 p-4 lg:p-6">
        {/* ------------------------------------------------ header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-lg">
              🎧
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                VoicePilot
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  Multilingual AI Voice Receptionist
                </span>
              </h1>
              <p className="text-[11px] text-zinc-500">
                AssemblyAI Voice Agent API · single WebSocket · real-time barge-in · tool calling
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusPill status={status} />
            {inCall ? (
              <button
                onClick={end}
                className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/20"
              >
                ■ End Call
              </button>
            ) : (
              <button
                onClick={start}
                className="animate-pulse-ring rounded-xl border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/25"
              >
                ● Start Call
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Diagnostic status bar — plain-language health of the two stages */}
        <DiagnosticsBar
          inCall={inCall}
          mic={micHealth}
          sttActive={sttActive}
          sttHadResult={sttHadResult}
        />

        {/* Fixed wire-level debug: what we send, what the server echoes */}
        <WireDebugPanel debug={wireDebug} />

        {/* ------------------------------------------------ main grid */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* left: live transcript */}
          <section className="flex min-h-[420px] flex-col gap-3 lg:h-[calc(100vh-150px)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Live Transcript
              </h2>
              <span className="text-[10px] text-zinc-600">
                {listening ? "Listening (English / Chinese / Malay, mixed is fine)" : " "}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <TranscriptPane
                entries={entries}
                userPartial={userPartial}
                agentPartial={agentPartial}
              />
            </div>
            <EventLog logs={logs} />
          </section>

          {/* right: cards + state */}
          <aside className="flex flex-col gap-4 lg:h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Booking Confirmations
              </h2>
              {bookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-panel/40 p-6 text-center text-xs text-zinc-600">
                  Once confirm_booking succeeds, the confirmation card pops in here
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((card, i) => (
                    <BookingCardView key={card.id} card={card} index={i} />
                  ))}
                </div>
              )}
            </div>

            <AvailabilityPanel slots={availability} />

            <ToolCallLogView calls={toolCalls} />
          </aside>
        </div>
      </div>
    </main>
  );
}
