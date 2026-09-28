"use client";

import { BookingCard } from "@/lib/voice-agent-client";

const KIND_META: Record<
  BookingCard["kind"],
  { label: string; badge: string }
> = {
  confirmed: { label: "✓ Booking Confirmed", badge: "bg-accent/20 text-accent" },
  rescheduled: { label: "↻ Booking Rescheduled", badge: "bg-accent2/20 text-accent2" },
  cancelled: { label: "✕ Booking Cancelled", badge: "bg-danger/20 text-danger" },
};

/**
 * Write-outcome card — the demo's right-stage visual focus. Pops in when a
 * write tool (confirm / reschedule / cancel) succeeds, and always shows the
 * post-write re-read verdict from the store:
 *   verified  → "✓ Verified in system"
 *   unverified→ red warning
 */
export function BookingCardView({ card, index }: { card: BookingCard; index: number }) {
  const meta = KIND_META[card.kind];
  const verified = card.verified === true;

  return (
    <div
      className={`animate-card-in rounded-2xl border bg-gradient-to-b to-panel p-4 ${
        verified
          ? "border-accent/30 from-accent/15 shadow-[0_8px_40px_-12px_rgba(46,230,168,0.45)]"
          : "border-danger/40 from-danger/10 shadow-[0_8px_40px_-12px_rgba(255,107,107,0.4)]"
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">{card.booking_id}</span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Service</dt>
          <dd className="font-medium text-zinc-100">{card.service_type}</dd>
        </div>
        {card.previous_time && (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Was</dt>
            <dd className="font-mono text-xs text-zinc-400 line-through">{card.previous_time}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">{card.kind === "cancelled" ? "Cancelled slot" : "Date & time"}</dt>
          <dd className="font-medium text-zinc-100">{card.confirmed_time}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Customer</dt>
          <dd className="font-medium text-zinc-100">{card.customer_name}</dd>
        </div>
        {card.phone && (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Phone</dt>
            <dd className="font-mono text-zinc-100">{card.phone}</dd>
          </div>
        )}
      </dl>

      {/* Post-write verification — the caller-visible truth from the store */}
      <div className="mt-3 border-t border-line pt-2.5">
        {verified ? (
          <p className="text-[11px] font-semibold text-accent">✓ Verified in system</p>
        ) : (
          <p className="text-[11px] font-semibold text-danger">
            ⚠ Not verified — the system could not re-read this record
          </p>
        )}
        {card.kind === "confirmed" && verified && (
          <div className="mt-1 space-y-1 text-[11px] text-zinc-500">
            <p>📱 Confirmation SMS sent to the customer</p>
            <p>🔔 Merchant notified</p>
          </div>
        )}
      </div>
    </div>
  );
}
