"use client";

import { SlotView } from "@/lib/voice-agent-client";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Availability board — the mock 7-day × 9-slot table the tools query.
 * Free slots glow; booked ones are dim — a live view of the calendar the
 * agent is actually consulting.
 */
export function AvailabilityPanel({ slots }: { slots: SlotView[] }) {
  if (slots.length === 0) return null;

  const dates = [...new Set(slots.map((s) => s.date))];
  const times = [...new Set(slots.map((s) => s.time))];

  const cell = (date: string, time: string) =>
    slots.find((s) => s.date === date && s.time === time);

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Merchant Availability (Mock)
          {(() => {
            const n = new Date();
            const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
            return <span className="ml-1.5 font-mono text-[10px] normal-case tracking-normal text-accent/80">· today {today}</span>;
          })()}
        </span>
        <span className="flex items-center gap-2 text-[9px] text-zinc-500">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-accent/70" />Open
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-zinc-700" />Booked
          </span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-center">
          <thead>
            <tr>
              <th className="w-12" />
              {times.map((t) => (
                <th key={t} className="text-[9px] font-normal text-zinc-600">
                  {t.replace(":00", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d) => {
              const day = new Date(`${d}T12:00:00`);
              const isToday = d === dates[0];
              return (
                <tr key={d}>
                  <td className="whitespace-nowrap text-right text-[9px] text-zinc-500">
                    {isToday ? "Today" : DAY_LABELS[day.getDay()]}
                  </td>
                  {times.map((t) => {
                    const s = cell(d, t);
                    if (!s) return <td key={t} />;
                    return (
                      <td key={t}>
                        <div
                          className={`h-4 w-4 rounded-sm ${
                            s.taken ? "bg-zinc-700/60" : "bg-accent/70 shadow-[0_0_6px_rgba(46,230,168,0.4)]"
                          }`}
                          title={`${d} ${t}${s.taken ? " booked" : " open"}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
