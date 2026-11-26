/**
 * Activities Module - Operational Knowledge Base & Settings Config
 */

export const ACTIVITIES_ABOUT_CONFIG = {
  applicationName: "NewaraAI",
  version: "1.0.0",
  modules: "Restaurant Management, Spa & Wellness, Villas & Units, Packages, Activities Management",
  timezone: "Asia/Kolkata (IST)",
  defaultTaxRate: "18.00% GST",
  bookingLifecycle: "Pending -> Confirmed -> Completed",
  alternateStatuses: "Cancelled (requires reason), No Show",
  loginRoute: "/login/activities",
  copyright: "© 2026 NewaraAI Hospitality Platform",
};

export const ACTIVITIES_HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started & Navigation",
    description: "Activities module sign-in, context isolation, and navigation overview",
    items: [
      {
        q: "How do I sign in to the Activities module?",
        a: "Open /login/activities (or select Activities Management on /login) and sign in with an ACTIVITY-context Manager account. Cross-module access to Restaurant, Spa, Villas, or Packages admin routes is blocked.",
      },
      {
        q: "How is the Activities sidebar organized?",
        a: "Use the left navigation bar for Dashboard, Activities, Schedule, Bookings, Session Roster, Customers, Invoices, Reports, and Settings.",
      },
    ],
  },
  {
    id: "booking-types",
    title: "B. Three Activity Booking Workflows",
    description: "Time Slot, Session, and Walk-in activity operations",
    items: [
      {
        q: "How do Time Slot activities work?",
        a: "Time Slot activities (e.g., Tennis Court, Private Guided Tour) book a specific Resource for a chosen date and start/end time. Overlapping reservations on the same resource are blocked (HTTP 409).",
      },
      {
        q: "How do Session activities work?",
        a: "Session activities (e.g., Morning Yoga, Nature Walk) reserve seats in a scheduled session. Available capacity is dynamically computed as Session Capacity minus active Pending/Confirmed participants.",
      },
      {
        q: "How do Walk-in activities work?",
        a: "Walk-in activities (e.g., Lagoon Kayaking, Indoor Recreation Centre) require no advance booking or session scheduling—staff record drop-in usage logs directly from Bookings or Schedule.",
      },
    ],
  },
  {
    id: "schedules-roster",
    title: "C. Schedules, Instructors & Session Roster",
    description: "Weekly templates, instructor conflict detection, waivers, and attendance",
    items: [
      {
        q: "Are sessions below minimum participants cancelled automatically?",
        a: "No. Sessions below minimum participants display an advisory operational warning so the coordinator can manually decide whether to proceed or cancel.",
      },
      {
        q: "How does waiver enforcement work?",
        a: "For activities marked Requires Waiver, bookings cannot transition to Completed until all participating guests have their waiver signed in Session Roster.",
      },
    ],
  },
  {
    id: "billing-reports",
    title: "D. Invoices, Payments & Reports",
    description: "GST billing, payment collection, PDF receipts, and CSV exports",
    items: [
      {
        q: "Do later activity price changes alter existing bookings?",
        a: "No. Bookings store price and activity snapshots at booking creation time so historical billing totals never drift.",
      },
      {
        q: "Can I export reports and invoice PDFs?",
        a: "Yes. Generate GST invoices and collect Cash, UPI, Card, or Net Banking payments under Invoices with downloadable PDFs, and export CSV reports from Reports.",
      },
    ],
  },
];
