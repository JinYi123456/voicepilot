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

function findSlot(date: string, timeSlot: string): Slot | undefined {
  // Match the exact hour "15:00" or a bare "15" (spoken forms may carry a
  // local hour marker) by grabbing the hour digits.
  const m = /(\d{1,2})/.exec(timeSlot);
  if (!m) return undefined;
  const hour = String(Number(m[1])).padStart(2, "0");
  const time = `${hour}:00`;
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
  date: string;
  weekday: string | null;
  time_slot: string;
  service_type: string;
  party_size: number;
  alternatives: { date: string; time: string }[];
};

/**
 * check_availability — exact-hour match first; if taken, offer the next
 * three free slots on the same day so the agent can suggest alternatives.
 */
export function checkAvailability(input: CheckAvailabilityInput): CheckAvailabilityOutput {
  const partySize = typeof input.party_size === "number" && input.party_size > 0 ? input.party_size : 2;
  const weekday = isoToWeekday(input.date);
  const slot = findSlot(input.date, input.time_slot);

  let available = false;
  let matchedTime = input.time_slot;
  if (slot) {
    available = !slot.taken;
    matchedTime = slot.time;
  }

  const alternatives: { date: string; time: string }[] = [];
  if (!available && slot) {
    for (const s of availability) {
      if (s.date === input.date && !s.taken) alternatives.push({ date: s.date, time: s.time });
      if (alternatives.length >= 3) break;
    }
  }

  return {
    available,
    date: input.date,
    weekday,
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
