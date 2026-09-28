"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentStatus,
  BookingCard,
  MicHealth,
  SlotView,
  ToolCallLog,
  VoiceAgentClient,
  WireDebug,
} from "@/lib/voice-agent-client";
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
import { TOOLS } from "@/lib/tools";

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
    setLogs((prev) => [...prev.slice(-160), `[${stamp}] ${line}`]);
  }, []);

  const start = useCallback(async () => {
    if (clientRef.current) return;
    setError("");
    setStatusDetail("");
    setAvailability([]);
    setWireDebug({});

    const client = new VoiceAgentClient({
      // Computed on every Start Call so "Today is ..." is always current.
      systemPrompt: buildSystemPrompt(new Date()),
      greeting: GREETING,
      voice: AGENT_VOICE,
      tools: TOOLS,
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
      onToolCall: (call) => setToolCalls((prev) => [call, ...prev].slice(0, 12)),
      onBooking: (card) => setBookings((prev) => [card, ...prev]),
      onLog: pushLog,
      onError: (msg) => setError(msg),
      onMicHealth: (h) => setMicHealth(h),
      onWireDebug: (patch) => setWireDebug((prev) => ({ ...prev, ...patch })),
    });

    clientRef.current = client;
    await client.start();
  }, [pushLog]);

  const end = useCallback(() => {
    clientRef.current?.end();
    clientRef.current = null;
    setUserPartial("");
    setAgentPartial("");
    setMicHealth(null);
    setSttActive(false);
    setSttHadResult(false);
  }, []);

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
    setUserPartial("");
    setAgentPartial("");
    setError("");
  }, []);

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
    start,
    end,
    reset,
  };
}
