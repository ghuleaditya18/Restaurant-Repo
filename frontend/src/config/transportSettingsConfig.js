/**
 * Transport Management Module - Operational Knowledge Base & Settings Config
 */

export const TRANSPORT_ABOUT_CONFIG = {
  applicationName: "NewaraAI",
  version: "1.0.0",
  modules: "Restaurant Management, Spa & Wellness, Villas & Units, Packages, Activities Management, Transport Management",
  timezone: "Asia/Kolkata (IST)",
  defaultTaxRate: "5.00% GST",
  bookingLifecycle: "Pending -> Confirmed -> Assigned -> Driver En Route -> In Progress -> Completed",
  alternateStatuses: "Cancelled (requires reason), No Show",
  loginRoute: "/login/transport",
  copyright: "© 2026 NewaraAI Hospitality Platform",
};

export const TRANSPORT_HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started & Navigation",
    description: "Transport module sign-in, context isolation, and workspace overview",
    items: [
      {
        q: "How do I sign in to Transport Management?",
        a: "Open /login/transport (or select Transport Management on /login) and sign in with your TRANSPORT-context Transport Manager account. Access to other resort module portals is strictly isolated.",
      },
      {
        q: "How is the Transport sidebar organized?",
        a: "Use the sidebar to switch between Dashboard, Vehicles, Drivers, Routes, Bookings, Trip Schedule, Maintenance, Expenses, Invoices, Reports, and Settings.",
      },
    ],
  },
  {
    id: "fleet-drivers",
    title: "B. Fleet Vehicles & Driver Management",
    description: "Vehicle categories, compliance alerts, driver availability, and licence tracking",
    items: [
      {
        q: "Why is a vehicle blocked from trip assignment?",
        a: "Vehicles that are Inactive, Under Maintenance, have lower seating capacity than the passenger count, or already have an overlapping active trip cannot be assigned.",
      },
      {
        q: "How do maintenance records affect vehicle availability?",
        a: "Recording an In Progress maintenance entry automatically sets the vehicle status to Maintenance and blocks new assignments until maintenance is Completed or Cancelled.",
      },
      {
        q: "How do driver licence and document expiry alerts work?",
        a: "Vehicles with upcoming/expired insurance, RC, permit, or service dates, and drivers with licences expiring within 30 days are automatically surfaced on the Dashboard and respective screens.",
      },
    ],
  },
  {
    id: "bookings-trips",
    title: "C. Transport Bookings, Scheduling & Trip Lifecycle",
    description: "Booking creation, conflict prevention, and live trip status updates",
    items: [
      {
        q: "Can a transport booking be linked to a stay, package, or activity?",
        a: "Yes. When creating a booking, optionally select an active Villa Stay, Package Booking, or Activity Booking to associate the transfer with existing resort records.",
      },
      {
        q: "What is the allowed trip status lifecycle?",
        a: "Bookings follow Pending -> Confirmed -> Assigned -> Driver En Route -> In Progress -> Completed (with Cancelled requiring a reason, or No Show). Departure/arrival timestamps and odometer readings can be recorded during execution.",
      },
    ],
  },
  {
    id: "billing-reports",
    title: "D. Invoices, Payments, Expenses & Reports",
    description: "GST billing, partial settlements, fuel logs, and operational CSV exports",
    items: [
      {
        q: "What payment types and methods are supported?",
        a: "Transport Invoices reuse the shared NewaraAI billing engine and support Cash, UPI, Card, and Net Banking across Advance, Partial, Full, and Refund entries with downloadable PDF receipts.",
      },
      {
        q: "Where can I review vehicle operating costs and utilization?",
        a: "Track fuel, toll, parking, and washing logs under Expenses (including vehicle-wise cost summaries), and export 9 operational reports from Reports as CSV.",
      },
    ],
  },
];
