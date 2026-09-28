/**
 * VoiceAgentClient — browser client for the AssemblyAI Voice Agent API.
 *
 * One WebSocket connection (wss://agents.assemblyai.com/v1/ws) handles
 * everything: mic audio in, agent audio out, transcripts, turn detection
 * (barge-in is decided server-side, we never hand-roll interruption logic),
 * and JSON-Schema tool calling.
 *
 * Wiring follows the official docs:
 * - token in the query string (minted server-side by /api/token)
 * - session.update with inline config (system_prompt / greeting / tools)
 *   sent immediately on open, before session.ready
 * - input.audio only after session.ready
 * - tool.call → accumulate → drain on reply.done (the docs' recommended
 *   client-side wiring; reply.done is always the latest event when the
 *   result is accepted)
 * - reply.done status "interrupted" → flush local audio buffer and restart
 *   the playback schedule (platform-recommended interruption flush)
 * - session.end → session.ended → close (never a bare ws.close(); the
 *   30-second resume grace window is billable)
 */

import { checkAvailability, confirmBooking, getAvailability } from "@/lib/mock";

export type AgentStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "agent_speaking"
  | "tool_running"
  | "ended"
  | "error";

export type ToolCallLog = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
  ts: number;
};

export type BookingCard = {
  id: string;
  booking_id: string;
  customer_name: string;
  phone: string;
  service_type: string;
  confirmed_time: string;
  ts: number;
};

export type SlotView = {
  date: string;
  time: string;
  taken: boolean;
};

export type WireDebug = {
  sessionUpdate?: string;
  wsHost?: string;
  sessionReadyConfig?: string;
  error?: string;
  errors?: string[];
  turnDetection?: string;
};

export type VoiceAgentClientOptions = {
  systemPrompt: string;
  greeting: string;
  voice: string;
  tools: unknown[];
  keyterms: string[];
  languageCodes: string[];
  turnDetection: {
    vadThreshold: number;
    minSilence: number;
    maxSilence: number;
    interruptResponse: boolean;
  };
  onStatus: (status: AgentStatus, detail?: string) => void;
  onUserDelta: (text: string) => void;
  onUserFinal: (text: string) => void;
  onAgentDelta: (text: string) => void;
  onAgentFinal: (text: string, interrupted: boolean) => void;
  onToolCall: (call: ToolCallLog) => void;
  onBooking: (card: BookingCard) => void;
  onLog: (line: string) => void;
  onError: (message: string) => void;
  onMicHealth: (health: MicHealth) => void;
  onWireDebug: (debug: WireDebug) => void;
};

const WS_BASE =
  process.env.NEXT_PUBLIC_MOCK_VOICE_WS || "wss://agents.assemblyai.com/v1/ws";

/**
 * Audio-path health snapshot, rendered by the diagnostic status bar in the
 * UI so a non-technical user can see which stage fails without DevTools.
 */
export type MicHealth = {
  /** true once any PCM chunk has been captured by the worklet */
  capturing: boolean;
  /** 0..1 approximate input level from the latest worklet heartbeat */
  level: number;
  /** true once the mic MediaStream track reports "live" and enabled */
  trackLive: boolean;
};
const TARGET_RATE = 24000;

export class VoiceAgentClient {
  private opts: VoiceAgentClientOptions;
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sessionReady = false;
  private ended = false;
  /** Set when end() is called while start() is still connecting. */
  private disposed = false;

  // Playback scheduling (24 kHz PCM16 → Float32 buffers)
  private playbackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private pendingResults: { call_id: string; result: string; is_error: boolean }[] = [];
  private lastEventWasReplyDone = false;

  // --- audio-path diagnostics (temporary, for the no-utterance bug hunt) ---
  private loggedDropNotReady = false;
  private chunksSent = 0;
  private lastSendLog = 0;
  // mic health state surfaced to the UI status bar
  private micCapturing = false;
  private micLevel = 0;
  // audio batching queue (~100 ms frames)
  private sendQueue: ArrayBuffer[] = [];
  private sendQueueBytes = 0;
  private sendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: VoiceAgentClientOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.ended = false;
    this.opts.onStatus("connecting");

    // 1. Mint a fresh single-use token immediately before every connection.
    let token: string;
    try {
      const res = await fetch("/api/token", { cache: "no-store" });
      const body = (await res.json()) as { token?: string; error?: string; detail?: string };
      if (!res.ok || !body.token) {
        throw new Error(body.detail || body.error || `token endpoint ${res.status}`);
      }
      token = body.token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.opts.onStatus("error", message);
      this.opts.onError(`Failed to get session token: ${message}`);
      return;
    }
    if (this.disposed) return;

    // 2. Audio pipeline. Default-rate context + in-worklet resample keeps
    // Chrome, Firefox and Safari all working (per docs browser matrix).
    try {
      this.audioCtx = new AudioContext();
      await this.audioCtx.resume();
      await this.audioCtx.audioWorklet.addModule("/worklets/pcm-processor.js");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.opts.onStatus("error", message);
      this.opts.onError(`Audio initialization failed: ${message}`);
      this.cleanupAudio();
      return;
    }
    if (this.disposed) {
      this.cleanupAudio();
      return;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.opts.onStatus("error", message);
      this.opts.onError(`Microphone access failed: ${message}`);
      this.cleanupAudio();
      return;
    }
    if (this.disposed) {
      this.cleanupAudio();
      return;
    }

    // Diagnostics: is the MediaStream track actually alive?
    const track = this.micStream.getAudioTracks()[0];
    this.opts.onLog(
      track
        ? `[diag] mic track: enabled=${track.enabled} readyState=${track.readyState} label="${track.label}"`
        : "[diag] getUserMedia returned NO audio track",
    );
    this.opts.onMicHealth({
      capturing: false,
      level: 0,
      trackLive: Boolean(track && track.readyState === "live" && track.enabled),
    });

    // 3. WebSocket — one connection for audio in/out, transcripts, tools.
    const wsUrl = new URL(WS_BASE);
    wsUrl.searchParams.set("token", token);
    const ws = new WebSocket(wsUrl.toString());
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.opts.onLog("WebSocket connected — sending session.update (minimal official shape)");
      // Official minimal inline shape: system_prompt, greeting, output.voice,
      // output.format.encoding, tools. input carries format.encoding plus the
      // tuned turn_detection timing. keyterms / language_codes remain opt-in
      // via feature flags for bisection.
      const input: Record<string, unknown> = {
        format: { encoding: "audio/pcm" },
        turn_detection: {
          vad_threshold: this.opts.turnDetection.vadThreshold,
          min_silence: this.opts.turnDetection.minSilence,
          max_silence: this.opts.turnDetection.maxSilence,
          interrupt_response: this.opts.turnDetection.interruptResponse,
        },
      };
      if (this.opts.keyterms.length > 0) input.keyterms = this.opts.keyterms;
      if (this.opts.languageCodes.length > 0) input.language_codes = this.opts.languageCodes;
      const sessionUpdate = {
        type: "session.update",
        session: {
          system_prompt: this.opts.systemPrompt,
          greeting: this.opts.greeting,
          input,
          output: {
            voice: this.opts.voice,
            format: { encoding: "audio/pcm" },
          },
          tools: this.opts.tools,
        },
      };
      this.opts.onWireDebug({
        sessionUpdate: JSON.stringify(sessionUpdate, null, 2),
        wsHost: wsUrl.host,
      });
      ws.send(JSON.stringify(sessionUpdate));
    });

    ws.addEventListener("message", (event) => {
      try {
        this.handleMessage(JSON.parse(event.data as string));
      } catch (err) {
        this.opts.onLog(`Failed to parse server message: ${String(err)}`);
      }
    });

    ws.addEventListener("close", (event) => {
      this.opts.onLog(`WebSocket closed (code ${event.code})`);
      if (!this.ended) {
        this.opts.onStatus("error", `Connection closed (${event.code})`);
      }
      this.cleanupAudio();
    });

    ws.addEventListener("error", () => {
      this.opts.onLog("WebSocket error event");
    });
  }

  /** User pressed "end call" — clean teardown, billing stops immediately. */
  end(): void {
    this.ended = true;
    this.disposed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.opts.onLog("Sending session.end (clean teardown)");
      this.ws.send(JSON.stringify({ type: "session.end" }));
      // Server emits session.ended then closes; cleanup happens on that event.
      setTimeout(() => {
        if (!this.sessionEnded) this.cleanupAudio();
      }, 1500);
    } else {
      this.cleanupAudio();
    }
  }

  private sessionEnded = false;

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string | undefined;
    if (!type) return;
    this.opts.onLog(`← ${type}`);
    // Console mirror — every server frame lands in DevTools for diagnosis.
    console.log(`[VoicePilot] ← ${type}`);
    if (type === "session.ready") {
      console.log("[VoicePilot] session.ready config echo:", msg);
    }

    switch (type) {
      case "session.ready": {
        this.sessionReady = true;
        this.opts.onStatus("ready", String(msg.session_id ?? ""));
        this.opts.onWireDebug({ sessionReadyConfig: JSON.stringify(msg.config ?? msg, null, 2) });
        this.startCapture();
        // Greeting audio will arrive as reply.audio; playback is generic.
        break;
      }

      case "input.speech.started": {
        this.opts.onStatus("listening");
        break;
      }

      case "transcript.user.delta": {
        this.opts.onUserDelta(String(msg.text ?? ""));
        break;
      }

      case "transcript.user": {
        this.opts.onUserDelta("");
        this.opts.onUserFinal(String(msg.text ?? ""));
        break;
      }

      case "reply.started": {
        this.opts.onStatus("agent_speaking");
        this.lastEventWasReplyDone = false;
        break;
      }

      case "reply.audio": {
        this.playAudioChunk(String(msg.data ?? ""));
        break;
      }

      case "transcript.agent.delta": {
        this.opts.onAgentDelta(String(msg.delta ?? ""));
        break;
      }

      case "transcript.agent": {
        const text = String(msg.text ?? "");
        const interrupted = Boolean(msg.interrupted);
        this.opts.onAgentDelta("");
        this.opts.onAgentFinal(text, interrupted);
        break;
      }

      case "tool.call": {
        this.lastEventWasReplyDone = false;
        this.opts.onStatus("tool_running");
        this.handleToolCall(msg);
        break;
      }

      case "reply.done": {
        this.lastEventWasReplyDone = true;
        const status = String(msg.status ?? "");
        if (status === "interrupted") {
          // User barged in: stop queued audio, restart the schedule, and
          // drop any tool results accumulated from the cut-off reply.
          this.flushPlayback();
          this.pendingResults = [];
        }
        // Drain accumulated tool results now — the accepted moment per docs.
        this.flushToolResults();
        if (this.pendingResults.length === 0 && status !== "interrupted") {
          this.opts.onStatus("listening");
        }
        break;
      }

      case "session.updated": {
        this.opts.onLog("session.updated (config applied)");
        break;
      }

      case "session.ended": {
        this.sessionEnded = true;
        this.opts.onLog(
          `session.ended — session ${String(msg.session_duration_seconds ?? "?")}s, audio ${String(
            msg.audio_duration_seconds ?? "?",
          )}s`,
        );
        this.opts.onStatus("ended");
        this.cleanupAudio();
        break;
      }

      case "session.error":
      case "error": {
        const code = String(msg.code ?? "error");
        const message = String(msg.message ?? "unknown error");
        this.opts.onError(`${code}: ${message}`);
        this.opts.onStatus("error", `${code}: ${message}`);
        this.opts.onWireDebug({ error: JSON.stringify(msg) });
        break;
      }

      default:
        break;
    }
  }

  private handleToolCall(msg: Record<string, unknown>): void {
    const callId = String(msg.call_id ?? "");
    const name = String(msg.name ?? "");
    const args = (msg.arguments ?? {}) as Record<string, unknown>;

    let result: unknown;
    let isError = false;

    try {
      if (name === "check_availability") {
        result = checkAvailability({
          service_type: String(args.service_type ?? ""),
          date: String(args.date ?? ""),
          time_slot: String(args.time_slot ?? ""),
          party_size: typeof args.party_size === "number" ? args.party_size : undefined,
        });
      } else if (name === "confirm_booking") {
        result = confirmBooking({
          customer_name: args.customer_name === undefined ? undefined : String(args.customer_name),
          phone: args.phone === undefined ? undefined : String(args.phone),
          service_type: String(args.service_type ?? ""),
          confirmed_time: String(args.confirmed_time ?? ""),
        });
        const r = result as { booking_id: string; customer_name: string; phone: string; service_type: string; confirmed_time: string };
        this.opts.onBooking({
          id: `card_${Date.now()}`,
          booking_id: r.booking_id,
          customer_name: r.customer_name,
          phone: r.phone,
          service_type: r.service_type,
          confirmed_time: r.confirmed_time,
          ts: Date.now(),
        });
      } else {
        isError = true;
        result = { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      isError = true;
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    const resultStr = JSON.stringify(result);
    this.opts.onLog(`⚙ ${name} → ${resultStr}`);
    this.opts.onToolCall({
      id: callId,
      name,
      args,
      result: resultStr,
      ts: Date.now(),
    });

    // Accumulate; drain on the next reply.done (docs' recommended wiring).
    this.pendingResults.push({ call_id: callId, result: resultStr, is_error: isError });
  }

  private flushToolResults(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.pendingResults.length === 0) return;
    if (!this.lastEventWasReplyDone) return; // only send when reply.done is latest
    for (const r of this.pendingResults) {
      this.ws.send(JSON.stringify({ type: "tool.result", ...r }));
      this.opts.onLog(`→ tool.result ${r.call_id}`);
    }
    this.pendingResults = [];
  }

  // ---------------------------------------------------------------- audio

  private startCapture(): void {
    if (!this.audioCtx || !this.micStream) return;
    const ctx = this.audioCtx;
    const source = ctx.createMediaStreamSource(this.micStream);
    const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
      processorOptions: { inputSampleRate: ctx.sampleRate, targetSampleRate: TARGET_RATE },
    });
    this.worklet = worklet;

    worklet.port.onmessage = (e: MessageEvent<unknown>) => {
      // Diagnostic messages from the worklet (object payloads).
      if (e.data && typeof e.data === "object" && "type" in (e.data as Record<string, unknown>)) {
        const d = e.data as { type: string; [key: string]: unknown };
        if (d.type === "diag-first") {
          this.opts.onLog(
            `[diag] worklet process() IS running (context rate ${d.inputSampleRate} Hz)`,
          );
          this.micCapturing = true;
          this.emitMicHealth();
        } else if (d.type === "diag") {
          const peak = typeof d.peak === "number" ? d.peak : 0;
          this.opts.onLog(
            `[diag] worklet ~${d.blocksPerSec} blocks/s, ${d.nonZeroBlocksPerSec} with signal, peak ${peak} (${d.inputSampleRate}Hz→${d.targetSampleRate}Hz)`,
          );
          this.micLevel = Math.min(1, peak * 4); // boost speech range into the meter
          this.micCapturing = true;
          this.emitMicHealth();
        }
        return;
      }
      if (!(e.data instanceof ArrayBuffer)) return;

      // Batch tiny worklet quanta (128 samples ≈ 2.7 ms @24 kHz) into ~100 ms
      // input.audio frames — the e2e logs showed 375 msgs/s when sending per
      // quantum, which needlessly hammers the socket.
      this.sendQueue.push(e.data);
      this.sendQueueBytes += e.data.byteLength;
      if (this.sendQueueBytes >= 4800) this.flushAudioQueue();
    };

    // The worklet doesn't need to reach the speakers; connect through a
    // zero-gain node so the graph stays alive without feeding echo.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(worklet).connect(sink).connect(ctx.destination);
    // Drain any partial ~100 ms frame on a fixed timer so the stream keeps
    // flowing even when worklet quanta don't align to the byte budget.
    this.sendTimer = setInterval(() => this.flushAudioQueue(), 100);
    this.opts.onLog("Mic capture started (24 kHz PCM16, 100 ms frames, echo cancellation on)");
  }

  private playAudioChunk(b64: string): void {
    const ctx = this.audioCtx;
    if (!ctx || !b64) return;
    const raw = atob(b64);
    const pcm16 = new Int16Array(raw.length / 2);
    for (let i = 0; i < pcm16.length; i++) {
      pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    }
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    const buffer = ctx.createBuffer(1, float32.length, TARGET_RATE);
    buffer.getChannelData(0).set(float32);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    this.playbackTime = Math.max(this.playbackTime, now);
    src.start(this.playbackTime);
    this.playbackTime += buffer.duration;
    this.activeSources.push(src);
    src.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== src);
    };
  }

  /** Interruption flush — clear queued audio, restart the schedule. */
  private flushPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.playbackTime = this.audioCtx.currentTime;
    }
  }

  private flushAudioQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Hold audio (don't drop) until session.ready; log the wait once.
      if (!this.loggedDropNotReady && this.sendQueueBytes > 0) {
        this.loggedDropNotReady = true;
        this.opts.onLog("[diag] audio buffered — waiting for session.ready before first send");
      }
      return;
    }
    if (this.sendQueueBytes === 0) return;
    const merged = new Uint8Array(this.sendQueueBytes);
    let offset = 0;
    for (const buf of this.sendQueue) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    this.sendQueue = [];
    this.sendQueueBytes = 0;

    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < merged.length; i += CHUNK) {
      binary += String.fromCharCode(...merged.subarray(i, i + CHUNK));
    }
    try {
      this.ws.send(JSON.stringify({ type: "input.audio", audio: btoa(binary) }));
      this.chunksSent++;
      const now = performance.now();
      if (now - this.lastSendLog >= 2000) {
        this.opts.onLog(
          this.lastSendLog === 0
            ? "[diag] first audio chunk SENT to server"
            : `[diag] sent ${this.chunksSent} audio frames in the last 2s`,
        );
        this.chunksSent = 0;
        this.lastSendLog = now;
      }
    } catch (err) {
      this.opts.onLog(`[diag] ws.send(input.audio) failed: ${String(err)}`);
    }
  }

  private emitMicHealth(): void {
    this.opts.onMicHealth({
      capturing: this.micCapturing,
      level: this.micLevel,
      trackLive: true,
    });
  }

  private cleanupAudio(): void {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    this.worklet?.disconnect();
    this.worklet = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
  }

  /** Current availability snapshot for the side panel. */
  getAvailabilityView(): SlotView[] {
    return getAvailability();
  }
}
