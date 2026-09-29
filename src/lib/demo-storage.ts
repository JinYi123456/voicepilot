/**
 * demo-storage.ts — browser localStorage persistence for the demo store.
 *
 * Everything lives under the `voicepilot:v1:` key prefix. Every read/write is
 * wrapped in try/catch: private mode, quota errors or corrupted JSON must
 * degrade to "no archive" instead of crashing the page. Nothing here runs
 * during SSR — callers only touch this from client code after mount, so
 * hydration stays consistent.
 */

export const STORAGE_PREFIX = "voicepilot:v1:";

export const STORAGE_KEYS = {
  bookings: `${STORAGE_PREFIX}bookings`,
  availability: `${STORAGE_PREFIX}availability`,
  activity: `${STORAGE_PREFIX}activity`,
  summary: `${STORAGE_PREFIX}summary`,
} as const;

/** All keys this app owns under the voicepilot:v1: prefix. */
export function allStorageKeys(): string[] {
  return Object.values(STORAGE_KEYS);
}

/** Shape of the archived activity log entries (newest first). */
export type ToolCallRecord = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
  ts: number;
};

/** Shape of the archived end-of-call summary. */
export type SummaryRecord = {
  id: string;
  intent: string;
  outcome: string;
  languages_used: string[];
  next_step: string;
  source: "tool" | "fallback";
  ts: number;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Missing storage, quota, disabled, or corrupted JSON — treat as empty.
    try {
      window.localStorage.removeItem(key); // drop the corrupted entry
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / storage disabled — the demo keeps working in memory.
  }
}

export function readBookings<T>(): T[] | null {
  const v = readJson<T[]>(STORAGE_KEYS.bookings);
  return Array.isArray(v) ? v : null;
}

export function readAvailability<T>(): T[] | null {
  const v = readJson<T[]>(STORAGE_KEYS.availability);
  return Array.isArray(v) ? v : null;
}

export function readActivity<T>(): T[] | null {
  const v = readJson<T[]>(STORAGE_KEYS.activity);
  return Array.isArray(v) ? v : null;
}

export function readSummary<T>(): T | null {
  return readJson<T>(STORAGE_KEYS.summary);
}

export function writeBookings(value: unknown): void {
  writeJson(STORAGE_KEYS.bookings, value);
}

export function writeAvailability(value: unknown): void {
  writeJson(STORAGE_KEYS.availability, value);
}

export function writeActivity(value: unknown): void {
  writeJson(STORAGE_KEYS.activity, value);
}

export function writeSummary(value: unknown): void {
  writeJson(STORAGE_KEYS.summary, value);
}

/**
 * Reset demo data — remove every `voicepilot:v1:*` key, including any legacy
 * entries that share the prefix, then let the store re-seed itself.
 */
export function clearDemoStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
