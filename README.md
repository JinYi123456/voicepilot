# VoicePilot 🎧

> A voice receptionist agent that understands **code-mixed English / Mandarin / Cantonese / Malay** — it answers calls for local small businesses (restaurants, clinics, salons, car washes…) and completes appointment bookings end-to-end.

lablab.ai × AssemblyAI Voice Agent Hackathon demo.

**Core architecture: the AssemblyAI Voice Agent API over a single WebSocket connection.**

- Speech-to-text (real-time STT with partial + final transcripts, native mid-sentence code-switching)
- Brain (AssemblyAI's managed LLM — no separate Gemini/OpenAI key needed)
- Text-to-speech (agent reply audio, streamed down as 24 kHz PCM)
- Turn detection / barge-in (server-side VAD + semantic interruption decisions; the frontend writes zero interruption logic)
- Tool calling (JSON-Schema tools executed client-side against mock data)

All of it runs over one `wss://agents.assemblyai.com/v1/ws` connection, and the whole app needs a single environment variable: `ASSEMBLYAI_API_KEY`.

---

## Architecture (text version)

```
┌─────────────────────────── Browser (Next.js SPA) ──────────────────────────┐
│                                                                            │
│  ┌─────────────┐   AudioWorklet    ┌────────────────────────────────────┐  │
│  │ Microphone   │──PCM16 24kHz──▶ │      VoiceAgentClient (TS)          │  │
│  │ getUserMedia │  (linear        │  src/lib/voice-agent-client.ts      │  │
│  └─────────────┘   resample)     └───────────────┬────────────────────┘  │
│                                                   │                        │
│  ┌─────────────┐   AudioBufferSource              │ ① input.audio (b64)    │
│  │ Speaker      │◀──24kHz PCM16────┐              │ ② session.update       │
│  │ playback     │                  │              │    (system_prompt /    │
│         ▲                         │              │     greeting / tools / │
│         │ reply.audio             │              │     keyterms / langs)  │
│         │                         │              │ ③ tool.result          │
│  ┌──────┴──────────┐               │              │ ④ session.end          │
│  │ UI (React)      │               │              │                        │
│  │ · Live transcript│              │              │                        │
│  │   (typewriter)  │               │              │                        │
│  │ · Status pill   │               │              │                        │
│  │ · Booking cards │◀──onBooking───┤              │                        │
│  │ · Availability  │◀──onToolCall──┤              │                        │
│  └─────────────────┘               │              │                        │
└────────────────────────────────────┼──────────────┼────────────────────────┘
                                     │              │
                        ┌────────────▼───┐   ┌──────▼──────────────────────┐
                        │ /api/token     │   │  wss://agents.assemblyai.com│
                        │ (Next.js Route)│   │        /v1/ws               │
                        │ Holds the      │──▶│  AssemblyAI Voice Agent API │
                        │ ASSEMBLYAI_    │   │  ┌────────┐ ┌─────┐ ┌────┐  │
                        │ API_KEY, mints │   │  │ Real-   │ │ LLM │ │TTS │  │
                        │ 1-use tokens   │   │  │ time STT│ │     │ │    │  │
                        └────────────────┘   │  └────────┘ └─────┘ └────┘  │
                                             │  Turn detection / barge-in  │
                                             │  handled server-side        │
                                             └─────────────────────────────┘

  Browser-side tool handlers (pure frontend mocks, no database):
    check_availability  → src/lib/mock.ts (next 7 days × 09:00–18:00, ~30% pre-booked)
    confirm_booking     → appends to in-memory bookings + pops the confirmation card
                          (simulated "SMS sent to customer / merchant notified")
```

**Key implementation points (all wired exactly per the official docs):**

| Capability | How it's done |
| --- | --- |
| Auth | Server mints a one-time short-lived token via `GET /v1/token` (`src/app/api/token/route.ts`); the browser only ever sees the token, the key never leaves the server |
| Session config | Immediately after connecting, sends `session.update` (inline mode: system_prompt / greeting / tools / keyterms / language_codes) |
| Audio input | AudioWorklet capture → 24 kHz PCM16 → base64 → `input.audio` (default-rate AudioContext + in-worklet resampling, compatible with Chrome / Firefox / Safari) |
| Audio output | `reply.audio` → PCM16 → Float32 → sequentially scheduled AudioBuffers |
| Interruptions | Server-side VAD + semantic decision; the frontend only handles `reply.done(status:"interrupted")` → flush the playback queue, drop unsent tool.results (the documented flush pattern). No hand-rolled interruption detection |
| Tool calling | `tool.call` arrives → run mock logic → accumulate → send `tool.result` on `reply.done` (the docs' recommended drain-on-reply.done wiring) |
| Hangup | `session.end` → wait for `session.ended` → clean up (avoids the billable 30-second resume grace window) |
| Multilingual | `language_codes: ["en","zh","yue","ms"]` steering + keyterms boost; STT code-switches natively mid-sentence |

---

## Run locally

```bash
# 1. Install dependencies (Node 18+)
npm install

# 2. Configure the single key
cp .env.example .env.local
#    Edit .env.local:
#    ASSEMBLYAI_API_KEY=<your AssemblyAI key>

# 3. Start
npm run dev
```

Open <http://localhost:3000> (**Chrome / Edge**; mic permission needs localhost or HTTPS) and click "● Start Call".

> Expect ~1 second of session setup before you can speak (token minting + WebSocket handshake). The event log at the bottom left shows every WebSocket frame, which makes debugging easy.

## Demo script — the 5 test sentences

Say the following 5 lines to the mic, in order. They cover every MVP demo point. The sentences are kept in their original code-mixed wording — that's the product's core selling point — with English translations in brackets.

| # | Say this (original, code-mixed) | English translation | What it demonstrates | Expected behavior |
| --- | --- | --- | --- | --- |
| 1 | **"Hi，我想book明天下午的appointment，洗车的"** | "Hi, I'd like to book an appointment tomorrow afternoon, for a car wash" | Code-mixed EN+ZH, intent + slot extraction | The agent notes service=car wash, date=tomorrow, and asks a short follow-up for the exact time |
| 2 | **"下个星期五得唔得？大概3点左右"** | "Would next Friday work? Around 3 o'clock" (Cantonese-flavored ZH) | Cantonese mixed with Mandarin/EN | The agent understands and checks Fri 15:00, then reads availability back aloud |
| 3 | **"Boleh saya buat temujanji untuk Sabtu, 2 orang"** | "May I make an appointment for Saturday, 2 people" (Malay) | Malay-dominant utterance | The agent understands Sabtu=Saturday, 2 orang=2 people, and runs the availability flow |
| 4 | **"等等，我刚才说错了，是周六不是周五，麻烦改一下"** | "Wait, I said that wrong — it's Saturday, not Friday, please change it" | Mid-conversation correction | The agent honors the latest correction (Saturday) and re-runs check_availability |
| 5 | **"Ok confirm，我叫Amy，电话是0123456789"** | "Ok, confirmed. My name is Amy, phone 0123456789" | Verbal confirmation → booking | The agent calls confirm_booking and the **confirmation card pops in on the right** (simulated "SMS sent / merchant notified") |

Tips for recording the demo video:

1. During sentences 2–3, the "Merchant Availability" panel on the right shows the agent really consulting a calendar (if that slot is booked, the agent verbally suggests other open slots the same day — which demos the "no availability" branch).
2. To showcase **real-time barge-in**: while the agent is reading back the confirmation, just cut in with "change it to Sunday" — it stops playing instantly and re-runs the flow (server-side semantic interruption).
3. Tool call arguments and results appear live in the "Tool Calls" panel at the bottom, making the two-step flow visible to judges: check_availability first → verbal confirmation → only then confirm_booking.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Add `ASSEMBLYAI_API_KEY` in the Vercel project environment settings, then `vercel deploy --prod`. Mic permissions work out of the box on HTTPS.

## Project structure

```
src/
├── app/
│   ├── api/token/route.ts     # Server-side one-time Voice Agent token minting (key never leaves the server)
│   ├── layout.tsx / globals.css / page.tsx
├── components/
│   ├── TranscriptPane.tsx     # Live transcript (typewriter effect on partials)
│   ├── BookingCardView.tsx    # Confirmation card (entrance animation — the demo's visual centerpiece)
│   ├── AvailabilityPanel.tsx  # 7-day availability heatmap
│   ├── ToolCallLogView.tsx    # Tool call args/results inspector
│   ├── StatusPill.tsx / EventLog.tsx
├── hooks/useVoiceAgent.ts     # React state layer
├── lib/
│   ├── voice-agent-client.ts  # Single-WebSocket client (audio, interruption flush, tool drain)
│   ├── agent.ts               # Runtime system prompt (hard-coded per the brief)
│   ├── tools.ts               # check_availability / confirm_booking JSON schemas
│   └── mock.ts                # In-memory availability table + bookings store
public/worklets/pcm-processor.js  # Mic capture worklet (24 kHz PCM16 + resampling)
```

## Tuning turn-taking (don't let the agent interrupt slow speakers)

The agent decides "the caller is done" after a pause. All knobs live in one place — `TURN_DETECTION` at the top of `src/lib/agent.ts` — and the exact values being sent are shown live in the page's **Wire Debug** panel:

| Field | What it means | Default here | Suggested range |
| --- | --- | --- | --- |
| `vad_threshold` | Speech-detection sensitivity, 0.0–1.0. **Lower = more sensitive.** Raise it in a loud room so background noise isn't treated as speech. | `0.5` | 0.3–0.7 |
| `min_silence` | Milliseconds of quiet before a pause counts as **end-of-turn**. The bigger the value, the longer the AI waits for you — but the slower it answers. | `800` | 600–2000 (official starter ships 1000, suggests trying 1800 for patient/interview-style agents) |
| `max_silence` | Milliseconds ceiling before end-of-turn is **forced**, even mid-thought. Must be ≥ `min_silence`. | `2500` | 2000–4000 (starter: 3000) |
| `interrupt_response` | Barge-in. Keep `true` so callers can always interrupt the agent; `false` reads disclaimers to the end. | `true` | keep `true` |

Rules of thumb (per the [turn detection docs](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/turn-detection-and-interruptions)):

- The platform is **semantic and adaptive by default** — it decides you're done from meaning, paces itself to the speaker's rhythm, and waits out full values (phone numbers, dates) your tools need. Prefer leaving `min_silence`/`max_silence` unset unless slow, multi-sentence, code-mixed speakers keep getting cut off — which is exactly this demo's audience, hence the explicit values.
- ⚠️ Setting `min_silence`/`max_silence` **disables adaptive pacing and entity-aware waiting** for the whole session. The docs' preferred gentle knob is `input.transcription_mode: "max_accuracy"` (waits longest in silence); try it before pushing raw thresholds higher.
- If the agent keeps interrupting itself, the mic is re-capturing its own TTS — use headphones or keep echo cancellation enabled (we do).

## Roadmap (slides only — not implemented in code)

- Real WhatsApp / SMS API integration
- Google Calendar / third-party CRM integration
- Sentiment analysis dashboard
- Multi-merchant back-office system
- User sign-up / login system
