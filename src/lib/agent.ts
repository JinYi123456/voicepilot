/**
 * Turn detection — how long the agent waits before deciding you're done.
 *
 * 数值越大，AI 等你越久，但回答也越慢。
 * (The bigger the values, the longer the AI waits for you — but the slower
 * it answers.)
 *
 * Docs (voice-agents/voice-agent-api/turn-detection-and-interruptions):
 *   vad_threshold      0.0–1.0, default 0.5. Speech-detection sensitivity;
 *                      LOWER is more sensitive. Raise it in a loud room.
 *   min_silence        ms of quiet before a pause counts as end-of-turn.
 *                      Default: adaptive. Starter example: 1000, "try 1800".
 *   max_silence        ms ceiling before end-of-turn is forced, even
 *                      mid-thought. Default: adaptive. Starter example: 3000.
 *   interrupt_response keep true — barge-in must stay enabled.
 *
 * ⚠️ Setting min/max silence disables the server's adaptive pacing and
 * entity-aware waiting (e.g. waiting for a full phone number) for the whole
 * session. The docs' preferred knob is input.transcription_mode="max_accuracy"
 * — try that first if this isn't patient enough.
 *
 * All four values live here; the Wire Debug panel on the page shows what is
 * actually being sent.
 */
export const TURN_DETECTION = {
  vad_threshold: 0.5, // default; only included so it's tunable in one place
  min_silence: 800,
  max_silence: 2500,
  interrupt_response: true,
};

/** One-line summary rendered in the on-page Wire Debug panel. */
export const TURN_DETECTION_SUMMARY = `vad_threshold=${TURN_DETECTION.vad_threshold}, min_silence=${TURN_DETECTION.min_silence}ms, max_silence=${TURN_DETECTION.max_silence}ms, interrupt_response=${TURN_DETECTION.interrupt_response}`;

/**
 * System prompt — hard-coded per the hackathon brief. Rules are written in
 * English; rule #2 keeps its original code-mixed example (that mixed sentence
 * is itself part of the product spec, not a translation target).
 */
export const SYSTEM_PROMPT = `You are VoicePilot, the voice receptionist for a local small business, handling appointment bookings over the phone.

Behavior rules:
1. Reply in natural spoken language. Keep it short, like a real receptionist — never bookish or written-style.
2. Callers may mix English, Chinese, and Malay words, even within a single sentence (e.g. "Boss，可以book明天下午3点吗，for 2个人"). You must understand the core intent and never get stuck on language mixing or ask the caller to "please speak one language only".
3. Callers may interrupt or correct earlier information at any time (e.g. saying "Friday" first, then "Saturday"); always go with the caller's latest correction.
4. Once service_type / date / time_slot are collected, call the check_availability tool first, then read the result back to the caller for verbal confirmation.
5. Only after the caller clearly says "yes / confirm / ok / right" may you call confirm_booking. Never write a booking to the store without explicit confirmation.
6. If information is incomplete (e.g. the time is unclear), ask a short follow-up question — one missing field at a time.
7. Be warm and professional, like a reliable local business receptionist, not a stiff robot.`;

/**
 * Greeting — spoken by the agent as soon as the session is ready.
 */
export const GREETING =
  "Hi there! This is VoicePilot, your AI receptionist. What can I help you book today?";

/**
 * Keyterms — bias transcription toward the multilingual vocabulary the
 * demo sentences use (Mandarin, Cantonese-flavoured, Malay, service words).
 * These are STT-engine data, not human-facing text, so they stay as-is.
 */
export const KEYTERMS = [
  "预约",
  "洗车",
  "剪发",
  "美容",
  "看诊",
  "接种疫苗",
  "明天",
  "后天",
  "周五",
  "周六",
  "周日",
  "下个星期五",
  "下午",
  "早上",
  "中午",
  "点",
  "得唔得",
  "麻烦",
  "temujanji",
  "Sabtu",
  "Jumaat",
  "Ahad",
  "orang",
  "boleh",
  "confirm",
  "appointment",
  "book",
  "booking",
  "VoicePilot",
];

/**
 * Language codes — steer the multilingual STT toward the languages the
 * demo mixes. The model still code-switches natively mid-sentence.
 */
export const LANGUAGE_CODES = ["en", "zh", "yue", "ms"];

/**
 * Agent voice. The official starter's minimal agent uses "anna".
 */
export const AGENT_VOICE = "anna";

/**
 --- FEATURE FLAGS (bisection harness) ---
 * The official minimal session.update sends NONE of these. They are added
 * back one at a time (set to true, test, repeat) to find which one breaks
 * transcription on the real API.
 */
export const ENABLE_KEYTERMS = false;
export const ENABLE_LANGUAGE_CODES = false;
