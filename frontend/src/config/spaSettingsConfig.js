/**
 * Spa Management System - Settings, About and Help Knowledge Base
 *
 * Strict Compliance:
 * - Uses only actual configured system parameters (e.g. 10:00-18:00 operating hours, 18% GST).
 * - All unconfigured business details (facility name, address, owner, phone, email, achievements) default to "Not configured".
 * - Does not invent fake business records.
 * - Client-side presentation only; no PostgreSQL records created.
 */

export const SPA_ABOUT = {
  overview: {
    facilityName: "Not configured",
    tagline: "Not configured",
    businessContext: "SPA",
    facilityType: "Wellness & Therapy Centre",
    address: "Not configured",
    ownerName: "Not configured",
    contactPhone: "Not configured",
    officialEmail: "Not configured",
    achievements: "Not configured",
    establishedYear: "Not configured",
  },
  operationalConfig: {
    operatingHours: "10:00 AM - 06:00 PM",
    timezone: "Asia/Kolkata (IST)",
    slotInterval: "15 minutes",
    defaultTaxRate: "18.00% GST",
    workflow: "Booked → In Progress → Completed",
    concurrencyProtection: "PostgreSQL Row-Level Locking (Therapist FOR UPDATE)",
  },
};

export const SPA_HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started",
    description: "System authentication, navigation, and Spa receptionist roles",
    items: [
      {
        q: "How do I log in to the Spa Management System?",
        a: "Navigate to /login/spa and sign in with an active Spa account. The selected login route checks the account's SPA business context before granting access.",
      },
      {
        q: "What is the Spa Dashboard?",
        a: "The Spa Dashboard provides live metrics for today's operations, including total appointments, active therapies in progress, completed sessions, available therapists, today's collected revenue, and pending invoice balances.",
      },
      {
        q: "How is Spa navigation organized?",
        a: "Use the left sidebar to navigate across Spa modules: Dashboard, Bookings, Services, Customers, Therapist Management, Invoices, and Settings. The navigation is tailored exclusively to wellness workflows.",
      },
      {
        q: "What operational permissions does a Spa Receptionist have?",
        a: "A Spa Receptionist can schedule appointments, manage client check-ins and session completion, register customers, update therapist weekly schedules, generate GST invoices, record payments, and manage personal profile details.",
      },
    ],
  },
  {
    id: "service-management",
    title: "B. Service Management",
    description: "Therapy categories, treatment catalog, duration, and pricing",
    items: [
      {
        q: "How do I add a new service category?",
        a: "Go to Services, click '+ New Category', specify the Category Name (e.g. Body Massages, Ayurvedic Therapies, Facials) and an optional description, then click 'Create Category'.",
      },
      {
        q: "How do I create a new therapy service?",
        a: "Under Services, click '+ New Service', select the category, enter the service name, price (in INR), and treatment duration in minutes (e.g. 30, 45, 60, 90 mins).",
      },
      {
        q: "Can service prices and durations be updated?",
        a: "Yes. Click the Edit button on any service card to adjust its name, price, or duration. Existing historical bookings and invoices retain their immutable snapshot pricing.",
      },
      {
        q: "How do I activate or deactivate a therapy?",
        a: "Toggle the Availability switch on the service card. Deactivated therapies cannot be selected for new bookings, but historical treatment records remain intact.",
      },
    ],
  },
  {
    id: "booking-management",
    title: "C. Booking Management",
    description: "Appointment scheduling, dynamic time slots, and the three-stage lifecycle",
    items: [
      {
        q: "How do I schedule a new appointment?",
        a: "Navigate to Bookings and click '+ New Appointment'. Follow the sequential selection: 1) Select or register Customer, 2) Select Primary Therapist, 3) Pick Appointment Date, 4) Choose Treatment Services, 5) Select an Available Time Slot button, and 6) Confirm & Schedule.",
      },
      {
        q: "How do dynamic therapy-based time slots work?",
        a: "The system computes the total duration of selected therapies and evaluates the therapist's working hours within Spa operating hours (10:00 AM - 6:00 PM in Asia/Kolkata). Available start slots are generated in 15-minute intervals.",
      },
      {
        q: "Why are past time slots not visible for today's date?",
        a: "The system automatically filters out past time slots based on the current wall-clock time in Asia/Kolkata. Receptionists can only book upcoming future slots for today or any future date.",
      },
      {
        q: "What is the three-stage booking workflow?",
        a: "The booking lifecycle consists of exactly three operational stages: Booked → In Progress → Completed. Booked represents a scheduled upcoming visit; In Progress indicates active therapy; Completed marks session conclusion.",
      },
      {
        q: "How do I check in a customer and start therapy?",
        a: "On any Booked appointment, click 'Check-in / Start Therapy'. After confirmation, the booking status immediately transitions to In Progress.",
      },
      {
        q: "How do I mark a session completed?",
        a: "When treatment concludes, click 'Complete Session' on the In Progress appointment. After confirmation, the booking transitions to Completed, unlocking invoice generation.",
      },
      {
        q: "How do I reschedule an appointment?",
        a: "Click the Reschedule (clock/arrow) icon on eligible active appointments. Choose the new date and therapist; the system dynamically displays available slots while excluding the current appointment's overlap.",
      },
      {
        q: "How are double-bookings and scheduling conflicts prevented?",
        a: "The backend acquires a PostgreSQL row-level lock on the therapist record during booking creation. Overlapping intervals for the same therapist are rejected deterministically with a 409 Conflict.",
      },
    ],
  },
  {
    id: "customer-management",
    title: "D. Customer Management",
    description: "Client profiles, contact details, and appointment history",
    items: [
      {
        q: "How do I register a new Spa customer?",
        a: "Go to Customers and click '+ New Customer', or choose '+ Register New Customer' directly inside the appointment booking modal. Provide the full name, 10-digit mobile number, optional email, and wellness notes.",
      },
      {
        q: "Can customer information be updated?",
        a: "Yes. Locate the customer row in Customer Management and click 'Edit' to update contact details or preferences.",
      },
      {
        q: "How do I view a customer's past treatments?",
        a: "Click 'History' on any customer card to review all previous appointments, assigned therapists, treatments received, and billing history.",
      },
    ],
  },
  {
    id: "staff-management",
    title: "E. Therapist Management",
    description: "Therapist roster, designations, and weekly shifts",
    items: [
      {
        q: "How do I add a new therapist to the roster?",
        a: "In Therapist Management, click '+ Add Staff Member', specify their Employee Code, Full Name, Designation, Phone Number, Specialization, and ensure 'Therapist' designation is enabled.",
      },
      {
        q: "How do I configure therapist weekly working hours?",
        a: "Click 'Schedule / Availability' on any therapist card. Configure start and end times for each day of the week (Monday through Sunday) within Spa operating hours.",
      },
      {
        q: "What happens if a therapist is marked inactive?",
        a: "Inactive therapists cannot be selected for new appointment bookings. Existing historical records remain unchanged.",
      },
    ],
  },
  {
    id: "invoice-management",
    title: "F. Invoice Management",
    description: "Billing generation, GST tax calculations, and official PDF receipts",
    items: [
      {
        q: "When can an invoice be generated?",
        a: "An invoice can only be generated after a therapy session reaches Completed status. Once completed, a 'Bill' button appears on the appointment row.",
      },
      {
        q: "How is GST calculated on Spa invoices?",
        a: "Taxes are calculated based on the configured rate (default 18% GST). Subtotal represents treatment charges, Tax Amount reflects 18% GST, and Total Amount is the sum of subtotal and tax.",
      },
      {
        q: "Can I download an official PDF invoice?",
        a: "Yes. From the Invoices list or booking detail, click 'Download PDF' to generate an official branded PDF receipt with tax breakdowns, invoice numbers, and payment status.",
      },
    ],
  },
  {
    id: "payment-management",
    title: "G. Payment Management",
    description: "Payment recording, multi-step settlement, and balance tracking",
    items: [
      {
        q: "How do I record a customer payment?",
        a: "Navigate to Invoices, open the invoice, click 'Record Payment', select the payment method (UPI, Card, Net Banking, or Cash), enter the amount, and confirm.",
      },
      {
        q: "What are the invoice payment statuses?",
        a: "Pending indicates zero payments received; Partially Paid indicates partial settlement with remaining balance due; Paid indicates full settlement.",
      },
      {
        q: "Are split or partial payments supported?",
        a: "Yes. Customers can pay in installments or across multiple payment modes until the balance due reaches zero.",
      },
      {
        q: "Where can I view transaction history?",
        a: "All payment records with timestamps, payment references, and payment modes are tracked under the Payment Transactions tab inside Spa Invoices and listed on invoice details.",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "H. Troubleshooting & Common Issues",
    description: "Solutions for common operational and scheduling issues",
    items: [
      {
        q: "Why does the booking modal say 'No available appointment slots'?",
        a: "This occurs if all operating hours for the therapist are fully booked on that date, if the therapist has no scheduled shift on that weekday, or if all slots for today have already passed.",
      },
      {
        q: "What causes 'Invalid status transition' errors?",
        a: "The system enforces strict sequential transitions: Booked → In Progress → Completed. Direct jumps (e.g. Booked directly to Completed) or backward transitions are rejected by backend validation rules.",
      },
      {
        q: "Why is invoice generation not available for my appointment?",
        a: "Invoices cannot be created for appointments in Booked or In Progress status. You must first complete the therapy session by clicking 'Complete Session'.",
      },
      {
        q: "Why was a payment rejected with 'Amount exceeds balance due'?",
        a: "The payment amount entered exceeds the invoice balance due. Verify the remaining balance on the invoice card and record an amount less than or equal to the balance.",
      },
      {
        q: "What should I do if a therapist is not available?",
        a: "Check Therapist Management to verify that the therapist is marked Active, has 'Is Therapist' enabled, and has scheduled availability for the selected day of the week.",
      },
    ],
  },
];
