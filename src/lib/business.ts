/**
 * business.ts — the fixed demo merchant. Every fact here is simulated
 * (fictional address / phone) and is the SINGLE source of truth for the
 * get_business_info tool. The system prompt forbids the model from quoting
 * prices, hours or services from memory — they must come through this file.
 */

export const BUSINESS = {
  name: "Sunrise Car Wash",
  tagline: "Hand & machine car wash — drive in or book ahead",
  timezone: "Asia/Kuala_Lumpur (GMT+8)",
  /** Opening hours: 09:00–18:00, every day. */
  open_hour: 9,
  close_hour: 18,
  /** Bookings accepted only within the next 7 days. */
  booking_window_days: 7,
  services: [
    {
      name: "Basic Wash",
      price_rm: 15,
      duration: "about 20 minutes",
      blurb: "Exterior foam wash, rinse and dry",
    },
    {
      name: "Wash & Wax",
      price_rm: 40,
      duration: "about 45 minutes",
      blurb: "Basic wash plus a hand-applied wax",
    },
    {
      name: "Interior Vacuum",
      price_rm: 20,
      duration: "about 30 minutes",
      blurb: "Full interior vacuum and dashboard wipe-down",
    },
    {
      name: "Full Detail",
      price_rm: 120,
      duration: "about 2 hours",
      blurb: "Inside-out deep clean: wash, wax, vacuum and polish",
    },
  ],
  /** Fictional — for the hackathon demo only. */
  address: "88 Jalan Cemerlang, Taman Megah, 47301 Petaling Jaya, Selangor",
  /** Fictional — for the hackathon demo only. */
  phone: "+60 3-0000 1234",
} as const;

export type BusinessTopic = "hours" | "services" | "prices" | "location";

export type BusinessInfoResult =
  | {
      topic: "hours";
      business: string;
      open: string;
      close: string;
      days: string;
      timezone: string;
      booking_window: string;
    }
  | {
      topic: "services";
      business: string;
      services: { name: string; duration: string; description: string }[];
    }
  | {
      topic: "prices";
      business: string;
      currency: string;
      prices: { service: string; price_rm: number }[];
    }
  | {
      topic: "location";
      business: string;
      address: string;
      phone: string;
      note: string;
    }
  | { error: string; allowed_topics: string[] };

/**
 * get_business_info — the only source the agent may quote for hours,
 * services, prices and location. Price questions MUST be answered from the
 * "prices" topic here; the model is never allowed to invent them.
 */
export function getBusinessInfo(topic: string): BusinessInfoResult {
  const t = (topic ?? "").trim().toLowerCase();

  switch (t) {
    case "hours":
      return {
        topic: "hours",
        business: BUSINESS.name,
        open: "09:00",
        close: "18:00",
        days: "every day, Monday to Sunday",
        timezone: BUSINESS.timezone,
        booking_window: "the next 7 days",
      };
    case "services":
      return {
        topic: "services",
        business: BUSINESS.name,
        services: BUSINESS.services.map((s) => ({
          name: s.name,
          duration: s.duration,
          description: s.blurb,
        })),
      };
    case "prices":
      return {
        topic: "prices",
        business: BUSINESS.name,
        currency: "RM (Malaysian Ringgit)",
        prices: BUSINESS.services.map((s) => ({
          service: s.name,
          price_rm: s.price_rm,
        })),
      };
    case "location":
      return {
        topic: "location",
        business: BUSINESS.name,
        address: BUSINESS.address,
        phone: BUSINESS.phone,
        note: "demo data — fictional address and phone number",
      };
    default:
      return {
        error: `unknown topic "${topic}"`,
        allowed_topics: ["hours", "services", "prices", "location"],
      };
  }
}
