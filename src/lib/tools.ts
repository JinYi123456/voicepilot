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
        service_type: {
          type: "string" as const,
          description: "Service the customer wants, e.g. car wash",
        },
        date: {
          type: "string" as const,
          description: "Booking date in YYYY-MM-DD format",
        },
        time_slot: {
          type: "string" as const,
          description: 'Start time in 24-hour format on the hour, e.g. "15:00"',
        },
        party_size: {
          type: "number" as const,
          description: "Number of people or cars, default 1",
        },
      },
      required: ["service_type", "date", "time_slot"],
    },
  },
  {
    type: "function" as const,
    name: "confirm_booking",
    description:
      "Call only after the customer verbally confirms. Writes the booking record and triggers the frontend confirmation card.",
    parameters: {
      type: "object" as const,
      properties: {
        customer_name: {
          type: "string" as const,
          description: "Customer's name as given verbally",
        },
        phone: {
          type: "string" as const,
          description: "Customer's contact phone number",
        },
        service_type: {
          type: "string" as const,
          description: "Service the customer wants, e.g. car wash",
        },
        confirmed_time: {
          type: "string" as const,
          description: 'Confirmed booking time in "YYYY-MM-DD HH:mm" format',
        },
      },
      required: ["service_type", "confirmed_time"],
    },
  },
];
