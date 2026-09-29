"use client";

import { useState } from "react";
import { ToolCallLogView } from "@/components/ToolCallLogView";
import { BookingCard, ToolCallLog } from "@/lib/voice-agent-client";
import { isPastBooking, statusLabel } from "@/lib/mock";
import type { Booking } from "@/lib/mock";

const WRITE_TOOLS = new Set(["confirm_booking", "reschedule_booking", "cancel_booking"]);

const STATUS_STYLE: Record<Booking["status"], string> = {
  confirmed: "bg-accent/15 text-accent border-accent/30",
  rescheduled: "bg-accent2/15 text-accent2 border-accent2/30",
  cancelled: "bg-danger/15 text-danger border-danger/30",
};

/** Whether a tool result carries a post-write verification verdict. */
function verifiedOf(call: ToolCallLog): boolean | null {
  if (!WRITE_TOOLS.has(call.name)) return null;
  try {
    const r = JSON.parse(call.result) as { verified?: boolean };
    return typeof r.verified === "boolean" ? r.verified : null;
  } catch {
    return null;
  }
}

/**
 * Owner View — the business-owner tab: the full booking list (including
 * rescheduled / cancelled records) and the activity log (the existing
 * tool-call inspector, integrated here so there is no duplicate panel).
 */
export function OwnerView({
  bookings,
  calls,
  availability,
  onResetDemo,
}: {
  bookings: Booking[];
  calls: ToolCallLog[];
  /** Count of open slots, to show the owner the day's capacity at a glance. */
  availability: { taken: boolean }[];
  /** "Reset demo data" — clears the localStorage archive and reseeds. */
  onResetDemo: () => void;
}) {
  const [tab, setTab] = useState<"bookings" | "activity">("bookings");
  const [confirming, setConfirming] = useState(false);

  const openSlots = availability.filter((s) => !s.taken).length;
  const totalSlots = availability.length;
  const active = bookings.filter((b) => b.status !== "cancelled").length;

  return (
    <div className="rounded-2xl border border-line bg-panel/60">
      {/* tab strip */}
      <div className="flex items-center gap-1 border-b border-line px-2 pt-2">
        {(
          [
            ["bookings", `Bookings (${bookings.length})`],
            ["activity", `Activity Log (${calls.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-lg px-3 py-1.5 text-[11px] font-semibold transition ${
              tab === key
                ? "border border-b-0 border-line bg-zinc-900/80 text-accent"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto pb-1.5 pr-1 text-[10px] text-zinc-600">
          {totalSlots > 0 && (
            <>
              {openSlots}/{totalSlots} slots open · {active} active
            </>
          )}
        </span>
      </div>

      <div className="max-h-[320px] overflow-y-auto p-3">
        {tab === "bookings" ? (
          bookings.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-600">
              No bookings yet — they appear here the moment a caller confirms one.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-600">
                  <th className="pb-2 pr-2 font-semibold">Customer</th>
                  <th className="pb-2 pr-2 font-semibold">Service</th>
                  <th className="pb-2 pr-2 font-semibold">Time</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-line/60">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-zinc-200">{b.customer_name}</div>
                      <div className="font-mono text-[10px] text-zinc-600">{b.phone}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-zinc-400">{b.service_type}</td>
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-zinc-300">
                      {b.confirmed_time}
                      {b.status === "rescheduled" && (
                        <span className="ml-1 text-[9px] text-accent2">(changed)</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${STATUS_STYLE[b.status]}`}
                      >
                        {statusLabel(b.status)}
                      </span>
                      {isPastBooking(b) && (
                        <span className="ml-1 inline-block rounded-full border border-zinc-600/60 bg-zinc-700/30 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
                          past
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <>
            <p className="mb-2 text-[10px] text-zinc-600">
              Every tool call with time, arguments, result and post-write verification.
              <span className="ml-1 text-zinc-500">
                (writes show ✓ verified / ✗ unverified)
              </span>
            </p>
            <ToolCallLogView calls={calls} />
          </>
        )}
      </div>

      {/* footer: storage note + reset (two-step confirm) */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <p className="text-[9.5px] leading-tight text-zinc-600">
          Demo data is stored in this browser only (localStorage). A real
          deployment would use a database.
        </p>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-[10px] text-warn">Sure?</span>
            <button
              onClick={() => {
                setConfirming(false);
                onResetDemo();
              }}
              className="rounded border border-danger/50 bg-danger/15 px-2 py-1 text-[10px] font-semibold text-danger transition hover:bg-danger/25"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded border border-line px-2 py-1 text-[10px] text-zinc-400 transition hover:text-zinc-200"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded border border-line px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-danger/50 hover:text-danger"
          >
            ⟲ Reset demo data
          </button>
        )}
      </div>
    </div>
  );
}

export { verifiedOf };
