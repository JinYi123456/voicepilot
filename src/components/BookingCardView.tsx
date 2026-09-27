"use client";

import { BookingCard } from "@/lib/voice-agent-client";

/**
 * Booking confirmation card — the demo's right-stage visual focus.
 * Pops in with an entrance animation when confirm_booking succeeds,
 * simulating "confirmation SMS sent to customer / merchant notified".
 */
export function BookingCardView({ card, index }: { card: BookingCard; index: number }) {
  return (
    <div
      className="animate-card-in rounded-2xl border border-accent/30 bg-gradient-to-b from-accent/15 to-panel p-4 shadow-[0_8px_40px_-12px_rgba(46,230,168,0.45)]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent">
          ✓ Booking Confirmed
        </span>
        <span className="font-mono text-[10px] text-zinc-500">{card.booking_id}</span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Service</dt>
          <dd className="font-medium text-zinc-100">{card.service_type}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Date &amp; time</dt>
          <dd className="font-medium text-zinc-100">{card.confirmed_time}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Customer</dt>
          <dd className="font-medium text-zinc-100">{card.customer_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Phone</dt>
          <dd className="font-mono text-zinc-100">{card.phone}</dd>
        </div>
      </dl>

      <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[11px] text-zinc-500">
        <p>📱 Confirmation SMS sent to the customer</p>
        <p>🔔 Merchant notified</p>
      </div>
    </div>
  );
}
