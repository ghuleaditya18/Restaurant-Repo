# DineFlow – Spa Management System
## Technical Specification & Architecture Design
**Date:** 20 November 2026
**Document Version:** 1.0.0
**Status:** Approved & Implemented
**Scope:** Core Spa Operations + Invoicing & Payment Management (Scope Expansion)

---

## 1. Executive Summary & Architecture Overview

The **Spa Management System** is implemented as an integrated, modular business extension within the existing DineFlow monorepo architecture (`Restaurant-Repo`). It operates on the existing PostgreSQL database and FastAPI backend without requiring separate services, external microservices, or database fragmentation.

### Monorepo Structure
```
Restaurant-Repo/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py              # Shared authentication & token issuing
│   │   │   ├── deps.py              # Context-aware security guards (require_restaurant_context, require_spa_context)
│   │   │   ├── spa/                 # Spa API Routers (services, staff, customers, bookings, invoices, payments, dashboard)
│   │   │   └── ...                  # Restaurant API Routers
│   │   ├── models/
│   │   │   ├── entities.py          # User, Table, MenuItem, Order, Invoice, Payment (with business_context on User)
│   │   │   └── spa.py               # 11 Spa Tables (T1 through T11)
│   │   ├── schemas/
│   │   │   ├── auth.py              # business_context in TokenResponse and UserResponse
│   │   │   └── spa.py               # Pydantic schemas for Spa domain entities
│   │   └── services/
│   │       └── spa_service.py       # Core business logic, validation, ReportLab PDF generation, status machine
│   ├── migrations/                  # Additive Alembic migration (a8df03202ce6)
│   ├── private/spa-invoices/        # Protected local directory for generated PDF invoices
│   └── tests/
│       └── test_spa_module.py       # Automated unit tests covering end-to-end Spa workflows
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Sidebar.jsx          # Dynamic sidebar (Restaurant vs Spa branding & navigation items)
│       │   ├── Header.jsx           # Dynamic title & receptionist role badge
│       │   └── ProtectedRoute.jsx   # Multi-business context guard (allowedContext)
│       ├── modules/
│       │   └── spa/
│       │       ├── components/      # Badges (BookingStatusBadge, PaymentStatusBadge)
│       │       ├── pages/           # SpaDashboard, SpaBookings, SpaServices, SpaCustomers, SpaStaff, SpaInvoices, SpaPayments
│       │       └── services/        # spaApi.js (Centralized Spa Axios HTTP client)
│       └── App.jsx                  # React Router configuration with /spa/* isolation
└── docs/
    └── SPA_MANAGEMENT_SYSTEM_SPEC.md
```

---

## 2. Approved Scope Expansion: Invoicing & Payment Management

The initial Technical Design and Implementation Plan designated Invoices and Payments as post-MVP capabilities. Following an approved requirement expansion, **Invoice Management and Payment Management have been fully designed, implemented, and verified in this initial release**:

1. **Invoice Management (Tables T9, T10)**:
   - Automated invoice creation upon appointment completion (`Completed` state).
   - Immutable snapshotting of service line items, durations, and rates.
   - Standard 18% Goods and Services Tax (GST) calculation.
   - PDF invoice generation using ReportLab stored securely under `backend/private/spa-invoices/`.
2. **Payment Management (Table T11)**:
   - Support for manual payment recording: **UPI**, **Card (POS)**, **Net Banking**, and **Cash**.
   - Flexible settlement: allows full or partial payments, automatically updating invoice `paid_amount`, `balance_due`, and `payment_status` (`Pending`, `Partially Paid`, `Paid`).
   - Transactional safety: payment amounts cannot exceed balance due; duplicate settlements are rejected.

---

## 3. Database Schema: 11 Spa Entities (T1 – T11)

All Spa tables use the `spa_` prefix to guarantee complete zero-collision isolation from Restaurant tables.

| Table Identifier | Table Name | Purpose | Key Attributes / Foreign Keys |
| :--- | :--- | :--- | :--- |
| **T1** | `spa_service_categories` | Groups spa services | `id`, `name`, `description`, `is_active`, `created_at` |
| **T2** | `spa_services` | Individual treatments | `id`, `category_id` (FK T1), `name`, `duration_minutes` (> 0), `price` (>= 0), `is_active` |
| **T3** | `spa_customers` | Independent Spa guest records | `id`, `name`, `email` (unique nullable), `phone` (unique), `gender`, `notes`, `created_at` |
| **T4** | `spa_staff` | Therapists & attendants roster | `id`, `name`, `employee_code` (unique nullable), `phone`, `email`, `specialization`, `is_therapist`, `is_active` |
| **T5** | `spa_staff_availability` | Weekly operating schedule | `id`, `staff_id` (FK T4), `day_of_week` (0=Sun..6=Sat), `start_time`, `end_time`, `is_working` |
| **T6** | `spa_bookings` | Central appointment record | `id`, `booking_number` (unique), `customer_id` (FK T3), `primary_therapist_id` (FK T4), `booking_date`, `start_time`, `end_time`, `total_duration_minutes`, `total_price`, `status`, `notes` |
| **T7** | `spa_booking_services` | Multi-service appointment items | `id`, `booking_id` (FK T6), `service_id` (FK T2), `duration_minutes`, `price` |
| **T8** | `spa_booking_status_history` | Audit log of state transitions | `id`, `booking_id` (FK T6), `previous_status`, `new_status`, `changed_by_user_id` (FK users), `timestamp`, `notes` |
| **T9** | `spa_invoices` | Billing records for appointments | `id`, `invoice_number` (unique), `booking_id` (FK T6 unique), `subtotal`, `tax_rate` (18%), `tax_amount`, `discount_amount`, `total_amount`, `paid_amount`, `balance_due`, `payment_status`, `pdf_path` |
| **T10** | `spa_invoice_items` | Snapshot line items | `id`, `invoice_id` (FK T9), `service_id` (FK T2 nullable), `service_name`, `duration_minutes`, `unit_price`, `total_price` |
| **T11** | `spa_payments` | Financial transaction ledger | `id`, `payment_reference` (unique), `invoice_id` (FK T9), `amount`, `payment_method` (`UPI`, `Card`, `Net Banking`, `Cash`), `reference_number`, `notes`, `created_at` |

---

## 4. Business Logic & State Machines

### 4.1 Booking State Machine
```
[Pending]
    │
    ▼
[Confirmed]
    │
    ▼
[Checked In]
    │
    ▼
[In Progress]
    │
    ▼
[Completed] ──► [Invoice Generated] ──► [Payment Settlement]
    │
    ├─► [Cancelled] (Allowed from Pending, Confirmed)
    └─► [No Show]   (Allowed from Pending, Confirmed)
```

- **Conflict Prevention**: Before a booking is created or rescheduled, the system evaluates:
  1. Does `start_time` precede `end_time`?
  2. Does the appointment fit within the therapist's operating schedule (`spa_staff_availability`) for that day of the week?
  3. Does the appointment overlap with any existing active booking for the same therapist on that date? Overlap condition:
     $$\text{Existing.StartTime} < \text{New.EndTime} \quad \text{AND} \quad \text{Existing.EndTime} > \text{New.StartTime}$$
- **Duration & Price Calculation**:
  $$\text{Total Duration} = \sum \text{Service.DurationMinutes}$$
  $$\text{End Time} = \text{Start Time} + \text{Total Duration}$$
  $$\text{Total Price} = \sum \text{Service.Price}$$

### 4.2 Invoicing & Payment Workflow
1. An appointment reaching status `Completed` qualifies for invoicing.
2. Generating an invoice executes transactional snapshotting of all services associated with the booking into `spa_invoice_items`.
3. Financial calculation:
   $$\text{Subtotal} = \sum \text{Item.TotalPrice}$$
   $$\text{Tax Amount} = \text{Subtotal} \times \left(\frac{18}{100}\right)$$
   $$\text{Total Amount} = \text{Subtotal} + \text{Tax Amount} - \text{Discount}$$
   $$\text{Balance Due} = \text{Total Amount} - \text{Paid Amount}$$
4. A professional PDF invoice is compiled with ReportLab, containing DineFlow Spa branding, invoice details, customer details, itemized service table, GST breakdown, and settlement details.
5. Multiple partial payments can be recorded until `balance_due == 0`, which transitions `payment_status` to `Paid`.

---

## 5. Security & Cross-Business Isolation

1. **User Identity & Token Context**:
   - `User.business_context` accepts either `"RESTAURANT"` or `"SPA"`.
   - The JWT token issued during authentication includes `business_context`.
2. **Backend Route Guards**:
   - `require_restaurant_context`: Injected into all Restaurant routers (`order.py`, `table.py`, `menu.py`, `customer.py`, `staff.py`, `invoice.py`, `payment.py`, `dashboard.py`). If a Spa user attempts to access any restaurant endpoint, the server responds with `403 Forbidden: Access denied for this business context`.
   - `require_spa_context`: Injected into all Spa routers (`/api/spa/*`). If a Restaurant user attempts to access any spa endpoint, the server responds with `403 Forbidden: Access denied for this business context`.
3. **Frontend Context Protection**:
   - `ProtectedRoute` inspects `user.business_context` against `allowedContext`. If mismatched, the client redirects immediately without exposing UI or triggering unauthorized API requests.
