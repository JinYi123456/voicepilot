/**
 * language-tags.ts — per-utterance language detection for the transcript pane.
 *
 * ⚠️ This is a local heuristic on the transcript TEXT ONLY ("detected from
 * transcript"). It is NOT an API-provided language label — the Voice Agent
 * API does not emit per-utterance language metadata, and the UI must not
 * imply otherwise.
 */

export type LangTag = "EN" | "中" | "BM";

/** Common Malay words that flip a sentence to "BM" (demo-scale list). */
const MALAY_WORDS = [
  "boleh",
  "tak",
  "nak",
  "saya",
  "kamu",
  "tolong",
  "terima",
  "kasih",
  "mahu",
  "mau",
  "esok",
  "sudah",
  "dah",
  "apa",
  "ini",
  "itu",
  "hari",
  "jam",
  "banyak",
  "sikit",
  "encik",
  "cik",
  "orang",
  "bos",
];

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Detect which languages appear in one utterance. A sentence can carry
 * several tags (code-mixing is the whole point of the demo).
 */
export function detectLangTags(text: string): LangTag[] {
  const tags: LangTag[] = [];
  const lower = (text ?? "").toLowerCase();

  if (CJK_RE.test(lower)) tags.push("中");

  const hasMalay = MALAY_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (hasMalay) tags.push("BM");

  // English: any 2+ letter Latin word that is NOT one of the Malay triggers.
  let residue = lower.replace(/[0-9]+/g, " ");
  for (const w of MALAY_WORDS) {
    residue = residue.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  }
  if (/[a-z]{2,}/.test(residue)) tags.push("EN");

  if (tags.length === 0) tags.push("EN");
  return tags;
}
