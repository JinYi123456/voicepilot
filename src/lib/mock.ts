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
  /** Lifecycle for the Owner View: cancelled/rescheduled records stay listed. */
  status: "confirmed" | "rescheduled" | "cancelled";
};

const BOOKING_SEEDS: Omit<Booking, "created_at">[] = [
  {
    id: "bk_seed_ali",
    customer_name: "Ali bin Abu",
    phone: "012-3456789",
    service_type: "Basic Wash",
    confirmed_time: "",
    status: "confirmed",
  },
  {
    id: "bk_seed_mei",
    customer_name: "Mei Ling",
    phone: "017-8881234",
    service_type: "Full Detail",
    confirmed_time: "",
    status: "confirmed",
  },
];

/** Normalize a tolerant time string to the exact on-the-hour "HH:00" form. */
export function normalizeTimeSlot(timeSlot: string): string | null {
  const hour = parseTimeHour(timeSlot);
  if (hour === null) return null;
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Short human label for the Owner View / status badges. */
export function statusLabel(status: Booking["status"]): string {
  switch (status) {
    case "cancelled":
      return "cancelled";
    case "rescheduled":
      return "rescheduled";
    default:
      return "confirmed";
  }
}

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

const bookings: Booking[] = BOOKING_SEEDS.map((seed, i) => {
  // Seed bookings land on day+2 so they always sit inside the bookable
  // window regardless of when the demo runs.
  const d = new Date();
  d.setDate(d.getDate() + 2 + i);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hour = 10 + i * 4; // 10:00 and 14:00
  const time = `${String(hour).padStart(2, "0")}:00`;
  // Seed slots count as taken on the availability board.
  const slot = availability.find((s) => s.date === iso && s.time === time);
  if (slot) slot.taken = true;
  return { ...seed, confirmed_time: `${iso} ${time}`, created_at: new Date().toISOString() };
});

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
  // Strip a leading date ("2026-10-01 11:00" / "2026-10-01T11:00") first —
  // otherwise the year's first two digits ("20") would parse as hour 20.
  const cleaned = (timeSlot ?? "").replace(/\d{4}-\d{2}-\d{2}/g, " ").replace(/[T]/g, " ");
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|点|o'?clock)?/i.exec(cleaned);
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
  /** Post-write re-read from the store: does the record really say this? */
  verified: boolean;
  /** The re-read record, returned alongside the verdict. */
  record: Booking;
};

/**
 * Post-write auto-verification — read the record back from the store and
 * compare the fields the write claimed to set. Attached to every write tool
 * result (VOICE2ERP pattern): the agent must report this to the caller.
 */
function verifyBooking(id: string, expected: Partial<Booking>): { verified: boolean; record: Booking | null } {
  const record = bookings.find((b) => b.id === id) ?? null;
  if (!record) return { verified: false, record: null };
  for (const [key, value] of Object.entries(expected)) {
    if (record[key as keyof Booking] !== value) return { verified: false, record };
  }
  return { verified: true, record };
}

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
    status: "confirmed",
  };
  bookings.push(booking);

  // Mark the slot taken on the availability table when we can resolve it.
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(input.confirmed_time);
  if (dateMatch) {
    const slot = findSlot(dateMatch[1], input.confirmed_time);
    if (slot) slot.taken = true;
  }

  const { verified, record } = verifyBooking(booking.id, {
    status: "confirmed",
    service_type: booking.service_type,
    confirmed_time: booking.confirmed_time,
  });

  return {
    booking_id: booking.id,
    status: "confirmed",
    sms_sent_to_customer: true,
    merchant_notified: true,
    service_type: booking.service_type,
    confirmed_time: booking.confirmed_time,
    customer_name: booking.customer_name,
    phone: booking.phone,
    verified,
    record: record ?? booking,
  };
}

export type LookupBookingInput = {
  customer_name?: string;
  phone?: string;
};

export type LookupBookingOutput = {
  found: number;
  /** Matches for the requested person; includes cancelled/rescheduled ones. */
  bookings: Booking[];
  /** Machine-readable outcome for the agent to speak from. */
  reason: "matched" | "no_match" | "missing_argument" | null;
};

/**
 * lookup_booking — find existing bookings by customer_name or phone before
 * any reschedule/cancel. Callers say "that's under my phone 017-..." or
 * "it's Mei Ling" — so both keys are tolerated, case-insensitively.
 */
export function lookupBooking(input: LookupBookingInput): LookupBookingOutput {
  const name = (input.customer_name ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim().toLowerCase();
  if (!name && !phone) {
    return { found: 0, bookings: [], reason: "missing_argument" };
  }
  const matches = bookings.filter((b) => {
    if (b.status === "cancelled") return false; // cancelled bookings can't be operated on
    if (name && b.customer_name.toLowerCase().includes(name)) return true;
    if (phone && b.phone.toLowerCase().replace(/[\s-]/g, "").includes(phone.replace(/[\s-]/g, ""))) return true;
    return false;
  });
  return { found: matches.length, bookings: matches, reason: matches.length > 0 ? "matched" : "no_match" };
}

export type RescheduleBookingInput = {
  booking_id: string;
  new_date: string;
  new_time_slot: string;
};

export type RescheduleBookingOutput = {
  success: boolean;
  reason: "booking_not_found" | "slot_unavailable" | "unparseable_input" | "same_time" | null;
  /** Only set on success. */
  booking_id?: string;
  old_time?: string;
  new_time?: string;
  service_type?: string;
  customer_name?: string;
  /** Post-write re-read verdict — the agent must report this to the caller. */
  verified?: boolean;
  /** The re-read record, returned alongside the verdict. */
  record?: Booking;
  /** Proposed alternatives when the requested slot is not free. */
  alternatives?: { date: string; time: string }[];
};

/** Release the slot a (non-cancelled) booking used to hold, when resolvable. */
function releaseSlotOf(booking: Booking): void {
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(booking.confirmed_time);
  if (!dateMatch) return;
  const slot = findSlot(dateMatch[1], booking.confirmed_time);
  if (!slot || !slot.taken) return;
  // Release only when no OTHER active booking still holds this exact slot
  // (protects double-booked slots and pre-seeded walk-ins).
  const key = `${slot.date} ${slot.time}`;
  const stillHeld = bookings.some(
    (b) => b.id !== booking.id && b.status !== "cancelled" && b.confirmed_time === key,
  );
  if (!stillHeld) slot.taken = false;
}

/**
 * reschedule_booking — atomically move a booking: the new slot must be free
 * BEFORE the move (otherwise nothing changes), the old slot is released,
 * and the store is re-read to verify the write.
 */
export function rescheduleBooking(input: RescheduleBookingInput): RescheduleBookingOutput {
  const booking = bookings.find((b) => b.id === input.booking_id);
  if (!booking || booking.status === "cancelled") {
    return { success: false, reason: "booking_not_found" };
  }

  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(input.new_date ?? "");
  const newTime = normalizeTimeSlot(input.new_time_slot ?? "");
  if (!dateMatch || !newTime) {
    return { success: false, reason: "unparseable_input" };
  }
  const newDate = dateMatch[1];
  const newConfirmed = `${newDate} ${newTime}`;

  if (newConfirmed === booking.confirmed_time) {
    return { success: false, reason: "same_time", booking_id: booking.id };
  }

  const target = availability.find((s) => s.date === newDate && s.time === newTime);
  if (!target || target.taken) {
    // Nearest open slots so the agent can propose alternatives.
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const alternatives: { date: string; time: string }[] = [];
    const startKey = `${newDate} ${newTime}`;
    for (const s of availability) {
      if (s.taken || s.date < todayIso) continue;
      if (`${s.date} ${s.time}` <= startKey) continue;
      alternatives.push({ date: s.date, time: s.time });
      if (alternatives.length >= 3) break;
    }
    return { success: false, reason: "slot_unavailable", alternatives };
  }

  // Move it: release the old slot, take the new one, update the record.
  releaseSlotOf(booking);
  target.taken = true;
  const oldTime = booking.confirmed_time;
  booking.confirmed_time = newConfirmed;
  booking.status = "rescheduled";

  const { verified, record } = verifyBooking(booking.id, {
    confirmed_time: newConfirmed,
    status: "rescheduled",
  });

  return {
    success: true,
    reason: null,
    booking_id: booking.id,
    old_time: oldTime,
    new_time: newConfirmed,
    service_type: booking.service_type,
    customer_name: booking.customer_name,
    verified,
    record: record ?? booking,
  };
}

export type CancelBookingInput = {
  booking_id: string;
};

export type CancelBookingOutput = {
  success: boolean;
  reason: "booking_not_found" | null;
  /** Only set on success. */
  booking_id?: string;
  released_time?: string;
  service_type?: string;
  customer_name?: string;
  /** Post-write re-read verdict — the agent must report this to the caller. */
  verified?: boolean;
  /** The re-read record, returned alongside the verdict. */
  record?: Booking;
};

/**
 * cancel_booking — mark the booking cancelled and release its slot.
 * Cancelled records stay in the store so the Owner View keeps the history.
 */
export function cancelBooking(input: CancelBookingInput): CancelBookingOutput {
  const booking = bookings.find((b) => b.id === input.booking_id);
  if (!booking || booking.status === "cancelled") {
    return { success: false, reason: "booking_not_found" };
  }

  releaseSlotOf(booking);
  booking.status = "cancelled";

  const { verified, record } = verifyBooking(booking.id, { status: "cancelled" });

  return {
    success: true,
    reason: null,
    booking_id: booking.id,
    released_time: booking.confirmed_time,
    service_type: booking.service_type,
    customer_name: booking.customer_name,
    verified,
    record: record ?? booking,
  };
}

/** Full booking list for the Owner View (includes cancelled/rescheduled). */
export function getBookings(): Booking[] {
  return [...bookings];
}

/** Availability snapshot after the latest write — the Owner View re-renders. */
export function getAvailability(): Slot[] {
  return availability.map((s) => ({ ...s }));
}
