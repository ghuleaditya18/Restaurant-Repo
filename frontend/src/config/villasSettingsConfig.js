/**
 * Villas & Units Management System - Operational Knowledge Base & Settings Config
 *
 * Strict Compliance:
 * - Uses only actual configured system defaults (Asia/Kolkata IST, 18.00% GST, booking status lifecycle).
 * - Unconfigured business contact details always default dynamically to "Not configured".
 * - Does not invent fake contacts, phone numbers, or business records.
 */

export const VILLAS_ABOUT_CONFIG = {
  applicationName: "NewaraAI",
  version: "1.0.0",
  modules: "Restaurant Management, Spa & Wellness Management, Villas & Units Management",
  timezone: "Asia/Kolkata (IST)",
  defaultTaxRate: "18.00% GST",
  bookingLifecycle: "Reserved -> Confirmed -> Checked In -> Checked Out",
  alternateStatuses: "Cancelled, No Show",
  loginRoute: "/login/villas",
  copyright: "© 2026 NewaraAI Hospitality Platform",
};

export const VILLAS_HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started & Navigation",
    description: "Villas module sign-in, roles, and isolated workspace routing",
    items: [
      {
        q: "How do I sign in to the Villas & Units module?",
        a: "Open /login/villas (or select Villas & Units on /login) and authenticate with a VILLA-context account. Authentication automatically targets the isolated Villas backend and protects Restaurant and Spa data from cross-module access.",
      },
      {
        q: "What does the Villas & Units Dashboard monitor?",
        a: "The Dashboard tracks Active Villas, Available Today, Occupancy Rate, Arrivals Today, Departures Today, Needs Housekeeping (including Out of Order units), Net Revenue Received, and Outstanding Balance in real time.",
      },
      {
        q: "What permissions do Villas Manager and Receptionist accounts have?",
        a: "Both roles can manage Stays & Bookings, Guests, Guest Services, Invoices, Payments, and Housekeeping readiness. Managers can also create, edit, deactivate, or delete Villas, Units, Categories, Seasonal Rates, and Property Profile details.",
      },
    ],
  },
  {
    id: "villas-units",
    title: "B. Villas, Units, Categories & Seasonal Pricing",
    description: "Inventory structure, cover images, sliding cards, and tariff rules",
    items: [
      {
        q: "How do I switch between sliding visual cards and tables on Villas & Units?",
        a: "In the Villas and Units tabs under Villas & Units Management, use the Cards | Table toggle in the filter bar. Cards display cover photography, unit capacity, nightly rate, housekeeping state, and quick actions; Table view provides compact multi-column scanning.",
      },
      {
        q: "How do cover image uploads work for Villas and Units?",
        a: "Inside any Create or Edit Villa/Unit modal, upload a JPG, PNG, or WebP image (up to 5 MB). You can preview immediately before saving, replace an existing photo, or remove the custom photo anytime without losing property details.",
      },
      {
        q: "How do Seasonal Rates and Availability Blocks affect stays?",
        a: "Seasonal Rates override a unit's base nightly rate within their configured effective date window. Availability Blocks place Maintenance, Owner Hold, or Renovation locks on date ranges and are automatically rejected if they overlap active bookings.",
      },
    ],
  },
  {
    id: "booking-lifecycle",
    title: "C. Stays & Booking Lifecycle",
    description: "Reservations, confirmations, check-in/out validation, cancellations, and no-shows",
    items: [
      {
        q: "What is the standard booking workflow?",
        a: "Bookings follow: Reserved -> Confirmed -> Checked In -> Checked Out. Cancelled and No Show are terminal statuses recorded with timestamped booking status history.",
      },
      {
        q: "Why might Check-In be blocked for a booking?",
        a: "The system prevents check-in if the stay is cancelled, already checked out, the assigned unit is currently Cleaning or Out of Order, or an active overlapping stay or availability block conflicts with the unit.",
      },
      {
        q: "When is Check-Out allowed?",
        a: "Before completing Check-Out, unclosed Guest Service requests must be resolved and the folio should be settled (or explicitly flagged if an authorized settlement exception applies).",
      },
    ],
  },
  {
    id: "housekeeping-services",
    title: "D. Housekeeping & Guest Services",
    description: "Room readiness states, maintenance holds, and itemized add-on charges",
    items: [
      {
        q: "What housekeeping statuses are supported?",
        a: "Each unit tracks Ready, Inspected, Cleaning, or Out of Order. Units marked Cleaning or Out of Order display alerts on the Dashboard and restrict quick-booking or check-in until restored.",
      },
      {
        q: "How are Guest Services billed to a stay?",
        a: "Add Airport Transfer, Dining, Excursion, Extra Bed, Laundry, or Custom charges to an active stay. Validated service charges post directly to the linked booking invoice.",
      },
    ],
  },
  {
    id: "invoices-refunds",
    title: "E. Invoices, Payments, Refunds & Reports",
    description: "18% GST itemized folios, advance refunds, PDF exports, and revenue reports",
    items: [
      {
        q: "How are Taxes and Totals calculated on Villas Invoices?",
        a: "Stay charges, extra guest fees, discounts, and fulfilled guest services are itemized on the booking invoice with configured GST (default 18.00%), showing Subtotal, Tax, Total, Net Paid, and Remaining Balance.",
      },
      {
        q: "How do advance payment refunds work on Cancellation or No Show?",
        a: "Cancelled bookings or completed advances can record partial or full Refund reversals from the invoice row, preserving full payment/reversal ledger history and adjusting Net Paid accurately.",
      },
      {
        q: "Can invoices be downloaded for guests?",
        a: "Yes. Once an invoice folio is generated, click the PDF action on the invoice row to download an itemized GST invoice PDF.",
      },
    ],
  },
];
