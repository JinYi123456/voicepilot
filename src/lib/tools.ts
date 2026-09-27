/**
 * Tools declared inline in session.update — the same two schema blocks from
 * the brief (descriptions localized to English). They are client-side
 * function tools: the agent emits a tool.call event, our browser code runs
 * the mock logic and sends a tool.result back. One JSON connection, no HTTP
 * round trip.
 */
export const TOOLS = [
  {
    type: "function" as const,
    name: "check_availability",
    description: "Check whether the merchant has an open slot at the given date and time.",
    parameters: {
      type: "object" as const,
      properties: {
        service_type: { type: "string" as const },
        date: { type: "string" as const },
        time_slot: { type: "string" as const },
        party_size: { type: "number" as const },
      },
      required: ["service_type", "date", "time_slot"],
    },
    execution_mode: "interactive" as const,
  },
  {
    type: "function" as const,
    name: "confirm_booking",
    description:
      "Call only after the customer verbally confirms. Writes the booking record and triggers the frontend confirmation card.",
    parameters: {
      type: "object" as const,
      properties: {
        customer_name: { type: "string" as const },
        phone: { type: "string" as const },
        service_type: { type: "string" as const },
        confirmed_time: { type: "string" as const },
      },
      required: ["service_type", "confirmed_time"],
    },
    execution_mode: "interactive" as const,
  },
];
