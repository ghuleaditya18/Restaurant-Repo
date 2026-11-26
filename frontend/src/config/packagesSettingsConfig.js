/**
 * Packages Module - Operational Knowledge Base & Settings Config
 */

export const PACKAGES_ABOUT_CONFIG = {
  applicationName: "NewaraAI",
  version: "1.0.0",
  modules: "Restaurant Management, Spa & Wellness, Villas & Units, Packages",
  timezone: "Asia/Kolkata (IST)",
  defaultTaxRate: "18.00% GST",
  bookingLifecycle: "Pending -> Confirmed -> In Progress -> Completed",
  alternateStatuses: "Cancelled (requires reason)",
  loginRoute: "/login/packages",
  copyright: "© 2026 NewaraAI Hospitality Platform",
};

export const PACKAGES_HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started & Navigation",
    description: "Packages module sign-in, context isolation, and navigation overview",
    items: [
      {
        q: "How do I sign in to the Packages module?",
        a: "Open /login/packages (or choose Packages on /login) and sign in with a PACKAGE-context Manager account. Cross-module access to Restaurant, Spa, or Villas admin routes is blocked.",
      },
      {
        q: "How is the Packages workspace organized?",
        a: "Use the left sidebar to navigate between Dashboard, Packages, Package Bookings, Seasonal Offers, Customers, Invoices, Reports, and Settings.",
      },
    ],
  },
  {
    id: "package-lifecycle",
    title: "B. Package Creation, Inclusions & Pricing",
    description: "Draft-first creation, mandatory inclusions, pricing models, and validity",
    items: [
      {
        q: "Why are new packages saved as Draft initially?",
        a: "New packages always start in Draft status so operators can verify pricing, validity dates, photography, and at least one valid inclusion before activating the package for bookings.",
      },
      {
        q: "What pricing models are supported?",
        a: "Packages support Per Package (flat bundle rate), Per Person (unit price × guest count), and Per Night (unit price × duration in nights), all calculated using exact decimal arithmetic.",
      },
      {
        q: "How do package inclusions interact with other modules?",
        a: "Package inclusions define what is bundled in the sale (Unit Stay, Meal Plan, Spa Service, Activity, Transport Service, Amenity, Other). Operational execution remains in each module without duplicate billing.",
      },
    ],
  },
  {
    id: "validity-blackouts",
    title: "C. Validity Windows & Blackout Dates",
    description: "Automatic expiry handling and blackout enforcement",
    items: [
      {
        q: "When is a package blocked from new bookings?",
        a: "Bookings are rejected if the package is Draft, Inactive, Expired, or Archived, if the start date falls outside Valid From–Valid To, overlaps an active Blackout Date range, or violates Min/Max Guest limits.",
      },
      {
        q: "How does automatic expiry work?",
        a: "Packages whose Valid To date is earlier than the current Asia/Kolkata business date are automatically transitioned to Expired and prevented from receiving new bookings.",
      },
    ],
  },
  {
    id: "bookings-billing",
    title: "D. Package Bookings, Snapshots & Invoices",
    description: "Booking snapshots, status transitions, advance/partial payments, and PDFs",
    items: [
      {
        q: "Do later package edits change existing bookings?",
        a: "No. Every Package Booking captures an immutable snapshot of package name, code, pricing type, unit price, total amount, duration, inclusions, and terms at booking time.",
      },
      {
        q: "How are Advance, Partial, and Full payments recorded?",
        a: "Generate an invoice for any active booking in Invoices (or during booking creation) and record Advance, Partial, or Full settlements via Cash, UPI, Card, or Net Banking with downloadable PDF receipts.",
      },
    ],
  },
];
