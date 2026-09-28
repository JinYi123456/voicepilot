/**
 * Tools declared inline in session.update — the official FLAT format only:
 * type / name / description / parameters, with a description on every field.
 * They are client-side function tools: the agent emits a tool.call event,
 * our browser code runs the mock logic and sends a tool.result back on the
 * same WebSocket. One JSON connection, no HTTP round trip.
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
      "Call only after the customer verbally confirms. Writes the booking record and triggers the frontend confirmation card. The result includes a verified field you MUST report to the customer.",
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
  {
    type: "function" as const,
    name: "lookup_booking",
    description:
      "Find the customer's existing bookings by name or phone before any reschedule or cancel. Call this FIRST when the customer wants to change or cancel a booking.",
    parameters: {
      type: "object" as const,
      properties: {
        customer_name: {
          type: "string" as const,
          description: "Customer's name as given verbally; optional if phone is provided",
        },
        phone: {
          type: "string" as const,
          description: "Customer's contact phone number; optional if customer_name is provided",
        },
      },
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "reschedule_booking",
    description:
      "Move an existing booking to a new date and time. Checks the new slot is free first and releases the old one. The result includes a verified field you MUST report to the customer.",
    parameters: {
      type: "object" as const,
      properties: {
        booking_id: {
          type: "string" as const,
          description: "Booking ID from lookup_booking, e.g. bk_seed_mei",
        },
        new_date: {
          type: "string" as const,
          description: "New booking date in YYYY-MM-DD format",
        },
        new_time_slot: {
          type: "string" as const,
          description: 'New start time in 24-hour format on the hour, e.g. "15:00"',
        },
      },
      required: ["booking_id", "new_date", "new_time_slot"],
    },
  },
  {
    type: "function" as const,
    name: "cancel_booking",
    description:
      "Cancel an existing booking and release its slot. The result includes a verified field you MUST report to the customer.",
    parameters: {
      type: "object" as const,
      properties: {
        booking_id: {
          type: "string" as const,
          description: "Booking ID from lookup_booking, e.g. bk_seed_mei",
        },
      },
      required: ["booking_id"],
    },
  },
  {
    type: "function" as const,
    name: "get_business_info",
    description:
      "Get authoritative business facts: opening hours, services, prices or location. ALWAYS answer price, hours, services or location questions from this tool — never from memory.",
    parameters: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string" as const,
          description: 'One of "hours", "services", "prices", "location"',
        },
      },
      required: ["topic"],
    },
  },
];

/**
 * Tier-2 tool: end-of-call summary. Declared separately (TOOLS_SUMMARY) so
 * the bisection harness can diff the two sets; both are sent together in
 * session.update.
 */
export const TOOLS_SUMMARY = [
  {
    type: "function" as const,
    name: "save_call_summary",
    description:
      "Save the end-of-call summary. Call this when the call is ending or the customer says goodbye, after the last action is done.",
    parameters: {
      type: "object" as const,
      properties: {
        intent: {
          type: "string" as const,
          description: 'What the caller wanted, e.g. "book a Full Detail for Saturday"',
        },
        outcome: {
          type: "string" as const,
          description: 'What happened, e.g. "booked Sat 15:00, verified in system"',
        },
        languages_used: {
          type: "array" as const,
          items: { type: "string" as const, description: 'Language name, e.g. "English", "Mandarin", "Malay"' },
          description: "Languages the caller mixed in this call",
        },
        next_step: {
          type: "string" as const,
          description: 'What happens next, e.g. "customer arrives Sat 15:00"',
        },
      },
      required: ["intent", "outcome", "next_step"],
    },
  },
];
