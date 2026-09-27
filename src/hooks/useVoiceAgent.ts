"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentStatus,
  BookingCard,
  SlotView,
  ToolCallLog,
  VoiceAgentClient,
} from "@/lib/voice-agent-client";
import { GREETING, KEYTERMS, LANGUAGE_CODES, SYSTEM_PROMPT } from "@/lib/agent";
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

  const pushLog = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLogs((prev) => [...prev.slice(-160), `[${stamp}] ${line}`]);
  }, []);

  const start = useCallback(async () => {
    if (clientRef.current) return;
    setError("");
    setStatusDetail("");
    setAvailability([]);

    const client = new VoiceAgentClient({
      systemPrompt: SYSTEM_PROMPT,
      greeting: GREETING,
      tools: TOOLS,
      keyterms: KEYTERMS,
      languageCodes: LANGUAGE_CODES,
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail ?? "");
        if (s === "ready") {
          setAvailability(client.getAvailabilityView());
        }
      },
      onUserDelta: (text) => setUserPartial(text),
      onUserFinal: (text) => {
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
    });

    clientRef.current = client;
    await client.start();
  }, [pushLog]);

  const end = useCallback(() => {
    clientRef.current?.end();
    clientRef.current = null;
    setUserPartial("");
    setAgentPartial("");
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
    start,
    end,
    reset,
  };
}
