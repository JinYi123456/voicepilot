"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentStatus,
  BookingCard,
  CallSummary,
  MicHealth,
  SlotView,
  ToolCallLog,
  VoiceAgentClient,
  WireDebug,
} from "@/lib/voice-agent-client";
import { getAvailability, getBookings, hydrateStore, resetStore, type Booking } from "@/lib/mock";
import {
  readActivity,
  readSummary,
  writeActivity,
  writeSummary,
  type ToolCallRecord,
  type SummaryRecord,
} from "@/lib/demo-storage";
import { detectLangTags } from "@/lib/language-tags";
import {
  AGENT_VOICE,
  ENABLE_KEYTERMS,
  ENABLE_LANGUAGE_CODES,
  GREETING,
  KEYTERMS,
  LANGUAGE_CODES,
  buildSystemPrompt,
  TURN_DETECTION,
  TURN_DETECTION_SUMMARY,
} from "@/lib/agent";
import { TOOLS, TOOLS_SUMMARY } from "@/lib/tools";

export type ChatEntry = {
  id: string;
  role: "user" | "agent";
  text: string;
  interrupted?: boolean;
  ts: number;
};

let uid = 0;
const nextId = () => `id_${Date.now().toString(36)}_${uid++}`;

export function useVoiceAgent() {
  const clientRef = useRef<VoiceAgentClient | null>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Live (in-flight) transcripts — rendered with a typewriter feel
  const [userPartial, setUserPartial] = useState("");
  const [agentPartial, setAgentPartial] = useState("");

  // Finalized conversation
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const [toolCalls, setToolCalls] = useState<ToolCallLog[]>([]);
  const [bookings, setBookings] = useState<BookingCard[]>([]);
  const [availability, setAvailability] = useState<SlotView[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  /** Owner View: the full booking store (confirmed + rescheduled + cancelled). */
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  /** End-of-call summary card (agent tool) or the frontend fallback. */
  const [callSummary, setCallSummary] = useState<CallSummary | null>(null);

  // Diagnostic status bar state
  const [micHealth, setMicHealth] = useState<MicHealth | null>(null);
  const [sttActive, setSttActive] = useState(false);
  const [sttHadResult, setSttHadResult] = useState(false);

  // Fixed on-page wire-debug panel; seeded with the turn_detection summary
  const [wireDebug, setWireDebug] = useState<WireDebug>({
    turnDetection: TURN_DETECTION_SUMMARY,
  });

  const pushLog = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    // Bounded ring; sized so a 30 s+ session's early [diag] lines survive.
    setLogs((prev) => [...prev.slice(-400), `[${stamp}] ${line}`]);
    // Mirror the diagnostic milestones to DevTools — the on-page EventLog is
    // a ring buffer and can age them out during long sessions.
    if (/\[diag\]|Mic capture started|first audio chunk/.test(line)) {
      console.log(`[VoicePilot] ${line}`);
    }
  }, []);

  /** Re-read the mock store so the Owner View / availability board stay live. */
  const refreshStore = useCallback(() => {
    setAllBookings(getBookings());
    setAvailability(getAvailability());
  }, []);

  // Restore the persisted demo store after mount (browser only — the module
  // seeds render on the server, so hydration stays consistent).
  useEffect(() => {
    hydrateStore();
    refreshStore();
    setToolCalls(readActivity<ToolCallRecord>() ?? []);
    setCallSummary(readSummary<SummaryRecord>());
  }, [refreshStore]);

  /**
   * Frontend fallback summary — built from the transcript and the tool log
   * when the agent never called save_call_summary. No LLM involved.
   */
  const buildFallbackSummary = useCallback(
    (finalEntries: ChatEntry[]): CallSummary => {
      const userTurns = finalEntries.filter((e) => e.role === "user").map((e) => e.text);
      const writeTools = new Set(["confirm_booking", "reschedule_booking", "cancel_booking"]);
      let lastWrite: ToolCallLog | null = null;
      let lastWriteVerified = true;
      for (const c of toolCalls) {
        if (writeTools.has(c.name)) {
          try {
            const r = JSON.parse(c.result) as { verified?: boolean };
            lastWriteVerified = r.verified !== false;
          } catch {
            lastWriteVerified = true;
          }
          lastWrite = c;
        }
      }

      const topicWords = userTurns.join(" ").toLowerCase();
      const askedPrice = /price|how much|多少钱|rm| harga/.test(topicWords);
      const askedHours = /open|hours|几点|营业|buka/.test(topicWords);
      const askedLocation = /where|address|地址|alamat|location/.test(topicWords);
      const intentBits: string[] = [];
      if (lastWrite?.name === "cancel_booking") intentBits.push("cancel a booking");
      else if (lastWrite?.name === "reschedule_booking") intentBits.push("reschedule a booking");
      else if (lastWrite) intentBits.push("book a car wash service");
      if (askedPrice) intentBits.push("asked about prices");
      if (askedHours) intentBits.push("asked about opening hours");
      if (askedLocation) intentBits.push("asked about location");
      if (intentBits.length === 0) intentBits.push("general enquiry");

      const outcome = lastWrite
        ? `${lastWrite.name} completed${lastWriteVerified ? " and verified in system" : " (⚠ verification failed)"}`
        : `enquiry only — no booking written${askedPrice || askedHours || askedLocation ? " (info provided via get_business_info)" : ""}`;

      const nextStep = lastWrite
        ? lastWrite.name === "cancel_booking"
          ? "rebook later if customer calls back"
          : "customer arrives at the booked slot"
        : "customer may call back to book";

      const langs: string[] = [];
      for (const t of userTurns) {
        for (const tag of detectLangTags(t)) {
          const full = tag === "中" ? "Chinese" : tag === "BM" ? "Malay" : "English";
          if (!langs.includes(full)) langs.push(full);
        }
      }

      return {
        id: `summary_fallback_${Date.now()}`,
        intent: intentBits.join("; "),
        outcome,
        languages_used: langs.length ? langs : ["English"],
        next_step: nextStep,
        source: "fallback",
        ts: Date.now(),
      };
    },
    [toolCalls],
  );

  const start = useCallback(async () => {
    if (clientRef.current) return;
    setError("");
    setStatusDetail("");
    setAvailability([]);
    setWireDebug({});
    setCallSummary(null);
    setBookings([]);
    refreshStore(); // seed the Owner View with the seeded demo bookings

    const client = new VoiceAgentClient({
      // Computed on every Start Call so "Today is ..." is always current.
      systemPrompt: buildSystemPrompt(new Date()),
      greeting: GREETING,
      voice: AGENT_VOICE,
      tools: [...TOOLS, ...TOOLS_SUMMARY],
      keyterms: ENABLE_KEYTERMS ? KEYTERMS : [],
      languageCodes: ENABLE_LANGUAGE_CODES ? LANGUAGE_CODES : [],
      turnDetection: {
        vadThreshold: TURN_DETECTION.vad_threshold,
        minSilence: TURN_DETECTION.min_silence,
        maxSilence: TURN_DETECTION.max_silence,
        interruptResponse: TURN_DETECTION.interrupt_response,
      },
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail ?? "");
        if (s === "ready") {
          setAvailability(client.getAvailabilityView());
        }
        if (s === "listening") setSttActive(true);
      },
      onUserDelta: (text) => {
        setUserPartial(text);
        if (text) {
          setSttActive(true);
          setSttHadResult(true); // a server transcript delta is definitive proof STT sees us
        }
      },
      onUserFinal: (text) => {
        if (text) {
          setSttActive(true);
          setSttHadResult(true);
        }
        setEntries((prev) => [
          ...prev,
          { id: nextId(), role: "user", text, ts: Date.now() },
        ]);
      },
      onAgentDelta: (text) => setAgentPartial(text),
      onAgentFinal: (text, interrupted) => {
        setEntries((prev) => [
          ...prev,
          { id: nextId(), role: "agent", text, interrupted, ts: Date.now() },
        ]);
      },
      onToolCall: (call) => {
        setToolCalls((prev) => {
          const next = [call, ...prev].slice(0, 30);
          writeActivity(next); // persist the activity log (newest first)
          return next;
        });
        // Writes (confirm/reschedule/cancel) mutate the mock store — re-read.
        if (["confirm_booking", "reschedule_booking", "cancel_booking"].includes(call.name)) {
          refreshStore(); // mock.ts persists the store on every write
        }
      },
      onBooking: (card) => setBookings((prev) => [card, ...prev]),
      onCallSummary: (summary) => {
        setCallSummary(summary);
        writeSummary(summary);
      },
      onLog: pushLog,
      onError: (msg) => setError(msg),
      onMicHealth: (h) => setMicHealth(h),
      onWireDebug: (patch) => setWireDebug((prev) => ({ ...prev, ...patch })),
    });

    clientRef.current = client;
    await client.start();
  }, [pushLog, refreshStore]);

  const end = useCallback(() => {
    // Fallback: if the agent never saved a summary, build one locally from
    // the finalized transcript + tool log (no LLM call).
    setEntries((current) => {
      setCallSummary((prev) => {
        if (prev) return prev;
        const hasConversation = current.some((e) => e.role === "user") || toolCalls.length > 0;
        return hasConversation ? buildFallbackSummary(current) : prev;
      });
      return current;
    });

    clientRef.current?.end();
    clientRef.current = null;
    setUserPartial("");
    setAgentPartial("");
    setMicHealth(null);
    setSttActive(false);
    setSttHadResult(false);
  }, [buildFallbackSummary, toolCalls]);

  // Allow restart once a session has ended or failed.
  useEffect(() => {
    if (status === "error" || status === "ended") {
      clientRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    return () => {
      // Component unmount: best-effort clean teardown.
      clientRef.current?.end();
      clientRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setToolCalls([]);
    setBookings([]);
    setCallSummary(null);
    setUserPartial("");
    setAgentPartial("");
    setError("");
    writeActivity([]);
    writeSummary(null);
    refreshStore();
  }, [refreshStore]);

  /** Owner View "Reset demo data": wipe localStorage, reseed the store. */
  const resetDemoData = useCallback(() => {
    resetStore();
    setToolCalls([]);
    setBookings([]);
    setCallSummary(null);
    setEntries([]);
    refreshStore();
  }, [refreshStore]);

  return {
    status,
    statusDetail,
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
    allBookings,
    callSummary,
    start,
    end,
    reset,
    resetDemoData,
  };
}
