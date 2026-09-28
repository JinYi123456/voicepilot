/**
 * Mock data — availability table + bookings. All in-memory, browser-side,
 * exactly as scoped for the hackathon demo. No real database.
 *
 * Availability: next 7 days (today + 6), 09:00–18:00, one slot per hour.
 * ~30% of slots are deterministically pre-marked as taken (seeded PRNG so
 * a demo run shows the same picture; bookings also mark slots taken live).
 */

export type Slot = {
  /** ISO date, e.g. "2026-09-28" */
  date: string;
  /** "HH:MM", e.g. "15:00" */
  time: string;
  taken: boolean;
};

export type Booking = {
  id: string;
  customer_name: string;
  phone: string;
  service_type: string;
  confirmed_time: string;
  created_at: string;
};

/** Deterministic PRNG (mulberry32) so the demo picture is stable. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAvailability(): Slot[] {
  const rand = mulberry32(20260927); // fixed seed → stable demo
  const slots: Slot[] = [];
  const today = new Date();
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let hour = 9; hour < 18; hour++) {
      slots.push({
        date: iso,
        time: `${String(hour).padStart(2, "0")}:00`,
        taken: rand() < 0.3,
      });
    }
  }
  return slots;
}

const availability: Slot[] = buildAvailability();

const bookings: Booking[] = [];

/** Weekday helpers for the mock store (Monday = 1 … Sunday = 7). */
function isoToWeekday(iso: string): string | null {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[d.getDay()];
}

/**
 * Tolerant time parser. Accepts "15:00", "10:00 AM", "3 PM", "3点",
 * "3 o'clock" — the LLM used to send 12-hour forms like "10:00 AM" which
 * the exact "HH:00" matcher silently failed on.
 * Returns the 24-hour hour, or null when nothing parseable is found.
 */
export function parseTimeHour(timeSlot: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|点|o'?clock)?/i.exec(timeSlot ?? "");
  if (!m) return null;
  let hour = Number(m[1]);
  const suffix = (m[3] ?? "").toLowerCase();
  if (suffix === "pm" && hour !== 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return hour;
}

/**
 * Tolerant date parser. Accepts YYYY-MM-DD (the documented format),
 * Date.parse-able forms, and bare weekday names resolved to the next
 * occurrence within the booking window.
 */
function parseDateIso(date: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const wd = weekdays.indexOf((date ?? "").trim().toLowerCase());
  if (wd >= 0) {
    const now = new Date();
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      if (d.getDay() === wd) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
    }
  }

  const parsed = Date.parse(date ?? "");
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function findSlot(date: string, timeSlot: string): Slot | undefined {
  const hour = parseTimeHour(timeSlot);
  if (hour === null) return undefined;
  const time = `${String(hour).padStart(2, "0")}:00`;
  return availability.find((s) => s.date === date && s.time === time);
}

export type CheckAvailabilityInput = {
  service_type: string;
  date: string;
  time_slot: string;
  party_size?: number;
};

export type CheckAvailabilityOutput = {
  available: boolean;
  /** null when available; a machine-readable cause otherwise */
  reason: "date_out_of_range" | "outside_business_hours" | "slot_taken" | "unparseable_input" | null;
  date: string;
  weekday: string | null;
  time_slot: string;
  service_type: string;
  party_size: number;
  /** nearest open slots (same day first, then following days) */
  alternatives: { date: string; time: string }[];
};

/**
 * check_availability — tolerant matching plus explicit reasons. Whatever the
 * outcome, `alternatives` carries the nearest bookable slots so the agent can
 * propose them instead of dead-ending on "fully booked".
 */
export function checkAvailability(input: CheckAvailabilityInput): CheckAvailabilityOutput {
  const partySize = typeof input.party_size === "number" && input.party_size > 0 ? input.party_size : 2;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const dateIso = parseDateIso(input.date);
  const hour = parseTimeHour(input.time_slot);

  let reason: CheckAvailabilityOutput["reason"] = null;
  let available = false;
  let matchedDate = dateIso ?? input.date;
  let matchedTime = input.time_slot;

  if (!dateIso || !hour) {
    reason = "unparseable_input";
  } else if (dateIso < todayIso) {
    reason = "date_out_of_range"; // in the past
  } else {
    // within the next 7 days?
    const limit = new Date(now);
    limit.setDate(now.getDate() + 6);
    const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, "0")}-${String(limit.getDate()).padStart(2, "0")}`;
    if (dateIso > limitIso) {
      reason = "date_out_of_range"; // beyond the bookable window
    } else if (hour < 9 || hour >= 18) {
      reason = "outside_business_hours"; // open 09:00–18:00
    }
  }

  const slot = dateIso ? findSlot(dateIso, input.time_slot) : undefined;
  if (!reason && slot) {
    available = !slot.taken;
    matchedDate = slot.date;
    matchedTime = slot.time;
    if (!available) reason = "slot_taken";
  }

  // Nearest open slots: strictly after the requested point (same day later
  // hours, then following days). When the request is unparseable or out of
  // range, fall back to the earliest opens in the whole window.
  const alternatives: { date: string; time: string }[] = [];
  if (!available) {
    const startKey =
      dateIso && hour !== null ? `${matchedDate} ${String(hour).padStart(2, "0")}:00` : null;
    for (const s of availability) {
      if (s.taken || s.date < todayIso) continue;
      const key = `${s.date} ${s.time}`;
      if (startKey && key <= startKey) continue;
      alternatives.push({ date: s.date, time: s.time });
      if (alternatives.length >= 3) break;
    }
    if (alternatives.length === 0) {
      for (const s of availability) {
        if (!s.taken && s.date >= todayIso) {
          alternatives.push({ date: s.date, time: s.time });
          if (alternatives.length >= 3) break;
        }
      }
    }
  }

  return {
    available,
    reason,
    date: matchedDate,
    weekday: isoToWeekday(matchedDate),
    time_slot: matchedTime,
    service_type: input.service_type,
    party_size: partySize,
    alternatives,
  };
}

export type ConfirmBookingInput = {
  customer_name?: string;
  phone?: string;
  service_type: string;
  confirmed_time: string;
};

export type ConfirmBookingOutput = {
  booking_id: string;
  status: "confirmed";
  sms_sent_to_customer: boolean;
  merchant_notified: boolean;
  service_type: string;
  confirmed_time: string;
  customer_name: string;
  phone: string;
};

/**
 * confirm_booking — appends to the mock store and marks the matching slot
 * taken. The UI opens the confirmation card when this runs.
 */
export function confirmBooking(input: ConfirmBookingInput): ConfirmBookingOutput {
  const booking: Booking = {
    id: `bk_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    customer_name: input.customer_name || "Unnamed customer",
    phone: input.phone || "Not provided",
    service_type: input.service_type,
    confirmed_time: input.confirmed_time,
    created_at: new Date().toISOString(),
  };
  bookings.push(booking);

  // Mark the slot taken on the availability table when we can resolve it.
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(input.confirmed_time);
  if (dateMatch) {
    const slot = findSlot(dateMatch[1], input.confirmed_time);
    if (slot) slot.taken = true;
  }

  return {
    booking_id: booking.id,
    status: "confirmed",
    sms_sent_to_customer: true,
    merchant_notified: true,
    service_type: booking.service_type,
    confirmed_time: booking.confirmed_time,
    customer_name: booking.customer_name,
    phone: booking.phone,
  };
}

export function getBookings(): Booking[] {
  return [...bookings];
}

export function getAvailability(): Slot[] {
  return availability.map((s) => ({ ...s }));
}
