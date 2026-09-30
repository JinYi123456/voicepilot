# VoicePilot 🎧

> A **multilingual AI front desk for small businesses** that understands **code-mixed English / Mandarin / Cantonese / Malay** (the caller can mix languages; VoicePilot's spoken replies are English by design — see [Language support](#language-support)) — it answers calls for the sample shop (Sunrise Car Wash), quotes prices & hours from the business profile, takes bookings, and reschedules or cancels them — with every write verified against the store.

Built for the lablab.ai × AssemblyAI Voice Agent Hackathon.

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
│         ▲                         │              │     greeting / tools)  │
│         │ reply.audio             │              │ ③ tool.result          │
│  ┌──────┴──────────┐               │              │ ④ session.end          │
│  │ UI (React)      │               │              │                        │
│  │ · Live transcript│              │              │                        │
│  │   (typewriter)  │               │              │                        │
│  │ · Status pill   │               │              │                        │
│  │ · Booking cards │◀──onBooking───┤              │                        │
│  │ · Availability  │◀──onToolCall──┤              │                        │
│  │ · Owner View    │               │              │                        │
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
    check_availability   → src/lib/mock.ts (next 7 days × 09:00–18:00, ~30% pre-booked)
    confirm_booking      → writes a booking, re-reads it, returns verified:true/false
    lookup_booking       → find bookings by customer_name or phone
    reschedule_booking   → checks the new slot is free, moves the record, releases the old slot
    cancel_booking       → marks the record cancelled and releases its slot
    get_business_info    → src/lib/business.ts (hours / services / prices / location)
    save_call_summary    → end-of-call summary (intent / outcome / languages / next step)
```

**Key implementation points (all wired exactly per the official docs):**

| Capability | How it's done |
| --- | --- |
| Auth | Server mints a one-time short-lived token via `GET /v1/token` (`src/app/api/token/route.ts`); the browser only ever sees the token, the key never leaves the server |
| Session config | Immediately after connecting, sends `session.update` (system_prompt / greeting / tools). Optional `keyterms` / `language_codes` steering exists in the code behind feature flags that are currently off |
| Dynamic date context | `buildSystemPrompt` (`src/lib/agent.ts`) embeds today's date **and a precomputed 7-day date↔weekday table** (computed in JS on every Start Call) so the model looks dates up instead of calculating them |
| Audio input | AudioWorklet capture → 24 kHz PCM16 → base64 → `input.audio` (default-rate AudioContext + in-worklet resampling, compatible with Chrome / Firefox / Safari) |
| Audio output | `reply.audio` → PCM16 → Float32 → sequentially scheduled AudioBuffers |
| Interruptions | Server-side VAD + semantic decision; the frontend only handles `reply.done(status:"interrupted")` → flush the playback queue, drop unsent tool.results (the documented flush pattern). No hand-rolled interruption detection |
| Tool calling | `tool.call` arrives → run mock logic → accumulate → send `tool.result` on `reply.done` (the docs' recommended drain-on-reply.done wiring) |
| Post-write verification | After every write (confirm / reschedule / cancel) the store record is **re-read** and the tool result carries `verified: true/false` + the record; the confirmation card shows **✓ Verified in system** or a red warning, and the agent is prompted to report the verdict to the caller |
| Owner View | An on-page tab for the business owner: the full bookings list (with rescheduled / cancelled statuses) and an Activity Log of every tool call (time, args, result, verified badge) |
| Call summary | The agent calls `save_call_summary` at goodbye; the card appears after the call ends. If it never fires, the frontend builds a fallback summary from the transcript + tool log (no LLM) |
| Persistence | Bookings, slot occupancy, the activity log and the last call summary persist to `localStorage` (prefix `voicepilot:v1:`) and hydrate on load — a refresh keeps the store state |
| Clean presentation UI | Engineering panels (mic/speech Diagnostics bar + Wire Debug) are **hidden by default**; open the page with `?debug=1` to show them |
| Hangup | `session.end` → wait for `session.ended` → clean up (avoids the billable 30-second resume grace window) |
| Multilingual (recognition only) | AssemblyAI STT code-switches natively mid-sentence; optional `language_codes: ["en","zh","yue","ms"]` steering + keyterms boost (feature flags currently off in `src/lib/agent.ts`). This is **input only** — the agent's voice output is English by design, see [Language support](#language-support) |

---

## Language support

Honest scope — what is verified, what is by design, and what is simulated:

| Layer | What it actually does | Limitations |
| --- | --- | --- |
| Speech recognition (input) | AssemblyAI streaming STT with native code-switching. Verified in our tests with **English, Mandarin, Cantonese and Malay mixed in one call**. | Recognition can still make mistakes on mixed-language speech; accuracy varies with accent and background noise. |
| Voice output (speaking) | AssemblyAI's voices officially support **English, Italian, Spanish, German, Portuguese and French only**. VoicePilot therefore answers in **English by design** — short, simple spoken English. | There are **no Chinese, Cantonese or Malay voices**: the agent understands those languages but never speaks them. |
| Transcript language tags (EN / 中 / BM) | Detected **locally** by a simple word list in our code (`src/lib/language-tags.ts`). | Heuristic and may be imperfect. **Not provided by AssemblyAI** — the UI labels them "detected from transcript". |
| "✓ Verified in system" | The booking record is re-read from the demo booking store after every write, and the verdict is shown to caller and owner. | The store is **simulated** (in-memory + localStorage) — there is no real backend or database. |

---

## Run locally

```bash
# 1. Install dependencies (Node 18.18+)
npm install

# 2. Configure the single key
cp .env.example .env.local
#    Edit .env.local:
#    ASSEMBLYAI_API_KEY=<your AssemblyAI key>

# 3. Start
npm run dev
```

Open <http://localhost:3000> (**Chrome / Edge**; mic permission needs localhost or HTTPS) and click "● Start Call".

> Expect ~1 second of session setup before you can speak (token minting + WebSocket handshake). Engineering panels are hidden by default — append `?debug=1` to the URL to see the mic/speech Diagnostics bar and the Wire Debug panel (every WebSocket frame), which makes debugging easy.

## Example things to say

The agent understands any mix of English, Mandarin, Cantonese and Malay — including mid-sentence switches and mid-conversation corrections:

- "Hi，我想 book 明天下午的 appointment，洗车的" — code-mixed English + Mandarin
- "Boleh saya buat temujanji untuk Sabtu, 2 orang" — Malay
- "等等，我刚才说错了，是周六不是周五，麻烦改一下" — mid-conversation correction (the agent honors the latest version)
- "How much is the Full Detail?" / "What time do you open?" — answered strictly from the business profile via `get_business_info`

Bookings require a spoken read-back and explicit confirmation before anything is written, and every write is verified against the store (see the Owner View on the right).

## Tests

```bash
npm run test:e2e
```

Fully automated headless-Chromium run (fake microphone, auto-granted mic permission): it opens the page, starts a call and asserts the complete audio → transcript → tool → reply pipeline with 22 checks, including booking persistence across a page reload. Without `ASSEMBLYAI_API_KEY` in the environment it runs against a local mock Voice Agent server (`scripts/mock-voice-agent-server.mjs`), so it needs no key and no network.

## The tools (all flat JSON-Schema, executed browser-side)

| Tool | Arguments | What it does |
| --- | --- | --- |
| `check_availability` | `service_type, date, time_slot, party_size?` | Checks the 7-day × 09:00–18:00 mock calendar; returns a machine-readable `reason` plus the 3 nearest open slots |
| `confirm_booking` | `customer_name?, phone?, service_type, confirmed_time` | Writes the booking, takes the slot, re-reads the record → `verified` |
| `lookup_booking` | `customer_name? / phone?` | Finds existing bookings by name or phone (required before reschedule/cancel per the prompt) |
| `reschedule_booking` | `booking_id, new_date?, new_time_slot?, customer_name?, phone?, service_type?` | Verifies the new slot is free **before** moving (or keeps the slot when only correcting a name/phone/service), releases the old slot, re-reads → `verified` |
| `cancel_booking` | `booking_id` | Marks the record `cancelled` (kept in the Owner View history), releases the slot, re-reads → `verified` |
| `get_business_info` | `topic: hours\|services\|prices\|location` | The single source of truth for Sunrise Car Wash facts; prices come **only** from here (`src/lib/business.ts`) |
| `save_call_summary` | `intent, outcome, languages_used, next_step` | End-of-call summary; the UI shows the card, or builds a fallback if never called |

## Owner View

The right column has an **Owner View** tab strip with:

- **Bookings** — every record in the store, including `rescheduled` and `cancelled` ones (the seed bookings "Ali bin Abu" and "Mei Ling" are always there so the store never starts empty), plus open-slot capacity at a glance.
- **Activity Log** — every tool call with timestamp, arguments, JSON result and a ✓ verified / ✗ unverified badge on writes (the existing tool-call inspector, integrated here).
- A **⟲ Reset demo data** button (with a confirmation step) wipes the archive and reseeds.

**Persistence:** bookings, slot occupancy, the activity log and the last call summary are stored in the browser's `localStorage` under the `voicepilot:v1:` prefix, so a page refresh keeps the state. All reads/writes are try/catch-guarded and a corrupted archive falls back to fresh seeds. Stale dates are handled on load: the 7-day slot table is always rebuilt from today, past bookings stay listed in the Owner View with a "past" badge (they no longer occupy slots), and in-window bookings re-take their slots. Data is stored in this browser only — a real deployment would use a database.

## Deploy to Vercel

**Dashboard (recommended):**

1. Push this repo to GitHub, then in [vercel.com/new](https://vercel.com/new) import it — Vercel auto-detects Next.js (no build settings needed).
2. In **Environment Variables** add the single variable: `ASSEMBLYAI_API_KEY` (used by `/api/token`, which runs server-side — the key is never exposed to the browser).
3. Deploy. Mic permissions work out of the box on HTTPS; all tool logic and the booking store run in the browser, so no database or extra services are needed.

**CLI equivalent:**

```bash
npm i -g vercel
vercel            # link + preview deploy
vercel --prod     # production deploy (set ASSEMBLYAI_API_KEY first, via dashboard or `vercel env add`)
```

## Project structure

```
src/
├── app/
│   ├── api/token/route.ts     # Server-side one-time Voice Agent token minting (key never leaves the server)
│   ├── icon.svg               # Favicon (headset mark)
│   ├── layout.tsx / globals.css / page.tsx
├── components/
│   ├── TranscriptPane.tsx     # Live transcript (typewriter partials + per-utterance language tags EN/中/BM)
│   ├── BookingCardView.tsx    # Write-outcome card with ✓ Verified in system badge (the demo's visual centerpiece)
│   ├── OwnerView.tsx          # Owner View: bookings table + Activity Log tabs
│   ├── SummaryCardView.tsx    # End-of-call summary card (tool or fallback)
│   ├── AvailabilityPanel.tsx  # 7-day availability heatmap (updates live on reschedule/cancel)
│   ├── ToolCallLogView.tsx    # Tool call args/results inspector (inside Owner View)
│   ├── StatusPill.tsx / EventLog.tsx / DiagnosticsBar.tsx / WireDebugPanel.tsx
├── hooks/useVoiceAgent.ts     # React state layer (incl. fallback call summary)
├── lib/
│   ├── voice-agent-client.ts  # Single-WebSocket client (audio, interruption flush, tool drain, tool routing)
│   ├── agent.ts               # Runtime system prompt (brief rules + front-desk rules + language rules + 7-day date table)
│   ├── tools.ts               # 7 flat tool schemas
│   ├── business.ts            # Sunrise Car Wash profile — the only source for hours/services/prices/location
│   ├── demo-storage.ts        # localStorage layer (voicepilot:v1: prefix, corruption-safe)
│   ├── language-tags.ts       # Local EN/中/BM detection for transcript tags
│   └── mock.ts                # In-memory availability + bookings store with status & verified re-reads
public/worklets/pcm-processor.js  # Mic capture worklet (24 kHz PCM16 + resampling)
scripts/
├── e2e-voice.mjs              # Headless end-to-end run (22 checks, fake mic)
└── mock-voice-agent-server.mjs # Local mock of the Voice Agent WS API (used when no key is set)
```

## Tuning turn-taking (don't let the agent interrupt slow speakers)

The agent decides "the caller is done" after a pause. All knobs live in one place — `TURN_DETECTION` at the top of `src/lib/agent.ts` — and the exact values being sent are shown live in the page's **Wire Debug** panel (hidden by default — open the page with `?debug=1` in the URL to also show the Wire Debug panel and the mic/speech Diagnostics bar):

| Field | What it means | Default here | Suggested range |
| --- | --- | --- | --- |
| `vad_threshold` | Speech-detection sensitivity, 0.0–1.0. **Lower = more sensitive.** Raise it in a loud room so background noise isn't treated as speech. | `0.5` | 0.3–0.7 |
| `min_silence` | Milliseconds of quiet before a pause counts as **end-of-turn**. The bigger the value, the longer the AI waits for you — but the slower it answers. | `800` | 600–2000 (official starter ships 1000, suggests trying 1800 for patient/interview-style agents) |
| `max_silence` | Milliseconds ceiling before end-of-turn is **forced**, even mid-thought. Must be ≥ `min_silence`. | `2500` | 2000–4000 (starter: 3000) |
| `interrupt_response` | Barge-in. Keep `true` so callers can always interrupt the agent; `false` reads disclaimers to the end. | `true` | keep `true` |

Rules of thumb (per the [turn detection docs](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/turn-detection-and-interruptions)):

- The platform is **semantic and adaptive by default** — it decides you're done from meaning, paces itself to the speaker's rhythm, and waits out full values (phone numbers, dates) your tools need. Prefer leaving `min_silence`/`max_silence` unset unless slow, multi-sentence, code-mixed speakers keep getting cut off — which is exactly this app's audience, hence the explicit values.
- ⚠️ Setting `min_silence`/`max_silence` **disables adaptive pacing and entity-aware waiting** for the whole session. The docs' preferred gentle knob is `input.transcription_mode: "max_accuracy"` (waits longest in silence); try it before pushing raw thresholds higher.
- If the agent keeps interrupting itself, the mic is re-capturing its own TTS — use headphones or keep echo cancellation enabled (we do).

## Roadmap (not implemented — planned)

- Real WhatsApp / SMS API integration
- Google Calendar / third-party CRM integration
- Sentiment analysis dashboard
- Multi-merchant back-office system
- User sign-up / login system
