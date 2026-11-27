"""Idempotent sample demo data seeder for the isolated Villas & Units SQLite database.

Usage:
    python scripts/seed_villas_demo.py --dry-run
    python scripts/seed_villas_demo.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load isolated Villas env before importing app settings/models if present
ENV_VILLAS_LOCAL = BACKEND_DIR / ".env.villas.local"
if ENV_VILLAS_LOCAL.exists():
    load_dotenv(ENV_VILLAS_LOCAL, override=True)

from app.core.date_utils import get_kolkata_today  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import (  # noqa: E402
    ServiceRequest,
    SeasonalRate,
    Staff,
    StayBooking,
    StayStatus,
    Unit,
    UnitBlock,
    UnitCategory,
    User,
    Villa,
    VillaGuest,
    VillaPayment,
    VillaPaymentReversal,
    VillaService,
)
from app.models.entities import UserRole  # noqa: E402
from app.services.villas_service import (  # noqa: E402
    compute_invoice_financials,
    derive_invoice_payment_status,
    money,
    record_booking_status_history,
    sync_villa_invoice,
)

EXPECTED_VILLAS_DB_SUBSTRING = "niwaraai_villas_dev.sqlite3"


def validate_target_database(db_url: str) -> None:
    parsed = make_url(db_url)
    db_str = (parsed.database or "").lower()
    driver = (parsed.drivername or "").lower()
    if "resort_db" in db_str or "restaurant_db" in db_str or "dineflow_db" in db_str:
        raise RuntimeError(
            f"SAFETY BLOCK: Refusing to run demo seeder against operational database ({db_url})."
        )
    if "sqlite" not in driver or EXPECTED_VILLAS_DB_SUBSTRING not in db_str:
        raise RuntimeError(
            f"SAFETY BLOCK: Demo seeder only targets the isolated Villas SQLite DB "
            f"({EXPECTED_VILLAS_DB_SUBSTRING}), got: {db_url}"
        )


def _rate_for_dates(db, unit: Unit, check_in, check_out) -> tuple[Decimal, Decimal]:
    nights = (check_out - check_in).days
    total = Decimal("0.00")
    for n in range(nights):
        stay_date = check_in + timedelta(days=n)
        seasonal = (
            db.query(SeasonalRate)
            .filter(
                SeasonalRate.unit_id == unit.id,
                SeasonalRate.start_date <= stay_date,
                SeasonalRate.end_date > stay_date,
            )
            .order_by(SeasonalRate.nightly_rate.desc())
            .first()
        )
        total += Decimal(str(seasonal.nightly_rate if seasonal else unit.base_rate))
    avg = (total / Decimal(nights)).quantize(Decimal("0.01"))
    return avg, total.quantize(Decimal("0.01"))


def run_seed(db, apply: bool) -> dict[str, int]:
    today = get_kolkata_today()
    counts = {
        "villas_created": 0,
        "categories_created": 0,
        "units_created": 0,
        "rates_created": 0,
        "blocks_created": 0,
        "services_created": 0,
        "staff_created": 0,
        "guests_created": 0,
        "bookings_created": 0,
        "service_requests_created": 0,
        "payments_created": 0,
        "refunds_created": 0,
        "skipped_existing": 0,
    }

    # Resolve an existing Villas manager for audit trails (never mutate existing manager accounts)
    manager = (
        db.query(User)
        .filter(User.business_context == "VILLA", User.role == UserRole.MANAGER)
        .order_by(User.id.asc())
        .first()
    )
    if not manager:
        raise RuntimeError(
            "No existing VILLA manager found in target DB. Create/preserve manager account first."
        )

    # 1. Villas
    villa_specs = [
        {
            "name": "Sahyadri Ridge Villa",
            "address": "North Crest Estate, Lonavala",
            "description": "Panoramic valley-view estate featuring private plunge pool villas and sunset decks.",
            "image_url": "/assets/villas/plunge-pool.jpg",
            "is_active": True,
        },
        {
            "name": "Konkan Lagoon Residence",
            "address": "Backwater Cove, Alibaug",
            "description": "Coastal garden suites steps away from private boardwalks and tropical palms.",
            "image_url": "/assets/villas/coastal-lagoon.jpg",
            "is_active": True,
        },
        {
            "name": "Mist Canopy Retreat",
            "address": "Shola Reserve Wing, Mahabaleshwar",
            "description": "Secluded woodland loft suites tucked under native evergreen canopy.",
            "image_url": "/assets/villas/forest-canopy.jpg",
            "is_active": True,
        },
    ]
    villas_by_name = {}
    for spec in villa_specs:
        existing = db.query(Villa).filter(Villa.name == spec["name"]).first()
        if existing:
            if not existing.image_url:
                existing.image_url = spec["image_url"]
                db.flush()
            counts["skipped_existing"] += 1
            villas_by_name[spec["name"]] = existing
        else:
            row = Villa(**spec)
            db.add(row)
            db.flush()
            counts["villas_created"] += 1
            villas_by_name[spec["name"]] = row

    # 2. Categories
    category_specs = [
        {"name": "Plunge Pool Villa", "description": "Private temperature-controlled plunge pool & veranda", "is_active": True},
        {"name": "Garden Courtyard Suite", "description": "Ground-level suite opening onto manicured botanical lawns", "is_active": True},
        {"name": "Treehouse Canopy Loft", "description": "Elevated timber deck suite with panoramic forest views", "is_active": True},
        {"name": "Heritage Family Pavilion", "description": "Multi-bedroom family residence with dedicated dining lounge", "is_active": True},
    ]
    cats_by_name = {}
    for spec in category_specs:
        existing = db.query(UnitCategory).filter(UnitCategory.name == spec["name"]).first()
        if existing:
            counts["skipped_existing"] += 1
            cats_by_name[spec["name"]] = existing
        else:
            row = UnitCategory(**spec)
            db.add(row)
            db.flush()
            counts["categories_created"] += 1
            cats_by_name[spec["name"]] = row

    # 3. Units
    unit_specs = [
        ("Sahyadri 101 - Infinity Pool", "Sahyadri Ridge Villa", "Plunge Pool Villa", 4, 2, "12500.00", "Ready", "/assets/villas/plunge-pool.jpg"),
        ("Sahyadri 102 - Valley Terrace", "Sahyadri Ridge Villa", "Plunge Pool Villa", 4, 2, "11800.00", "Inspected", "/assets/villas/plunge-pool.jpg"),
        ("Sahyadri 103 - Cliff Pavilion", "Sahyadri Ridge Villa", "Heritage Family Pavilion", 6, 3, "16500.00", "Needs Cleaning", "/assets/villas/garden-pavilion.jpg"),
        ("Lagoon 201 - Palm Courtyard", "Konkan Lagoon Residence", "Garden Courtyard Suite", 2, 1, "7800.00", "Ready", "/assets/villas/garden-pavilion.jpg"),
        ("Lagoon 202 - Backwater Deck", "Konkan Lagoon Residence", "Garden Courtyard Suite", 3, 1, "8400.00", "Cleaning", "/assets/villas/coastal-lagoon.jpg"),
        ("Lagoon 203 - Cove Pool Villa", "Konkan Lagoon Residence", "Plunge Pool Villa", 4, 2, "13200.00", "Out of Order", "/assets/villas/coastal-lagoon.jpg"),
        ("Canopy 301 - Whispering Pines", "Mist Canopy Retreat", "Treehouse Canopy Loft", 2, 1, "9200.00", "Ready", "/assets/villas/forest-canopy.jpg"),
        ("Canopy 302 - Cloud Loft", "Mist Canopy Retreat", "Treehouse Canopy Loft", 3, 2, "10400.00", "Inspected", "/assets/villas/forest-canopy.jpg"),
    ]
    units_by_name = {}
    for name, v_name, c_name, cap, br, rate, hk, img_url in unit_specs:
        villa = villas_by_name[v_name]
        cat = cats_by_name[c_name]
        existing = db.query(Unit).filter(Unit.villa_id == villa.id, Unit.name == name).first()
        if existing:
            if not existing.image_url:
                existing.image_url = img_url
                db.flush()
            counts["skipped_existing"] += 1
            units_by_name[name] = existing
        else:
            row = Unit(
                villa_id=villa.id,
                category_id=cat.id,
                name=name,
                capacity=cap,
                bedrooms=br,
                base_rate=Decimal(rate),
                housekeeping_status=hk,
                description=f"{c_name} inside {v_name}",
                image_url=img_url,
                is_active=True,
            )
            db.add(row)
            db.flush()
            counts["units_created"] += 1
            units_by_name[name] = row

    # 4. Seasonal Rates
    rate_specs = [
        ("Sahyadri 101 - Infinity Pool", "Peak Ridge Season", today + timedelta(days=5), today + timedelta(days=20), "14900.00"),
        ("Lagoon 201 - Palm Courtyard", "Coastal Long Weekend", today + timedelta(days=10), today + timedelta(days=18), "9600.00"),
        ("Canopy 301 - Whispering Pines", "Misty Escape Premium", today + timedelta(days=3), today + timedelta(days=15), "11200.00"),
    ]
    for u_name, r_name, s_dt, e_dt, r_amt in rate_specs:
        u = units_by_name[u_name]
        existing = db.query(SeasonalRate).filter(SeasonalRate.unit_id == u.id, SeasonalRate.name == r_name).first()
        if existing:
            counts["skipped_existing"] += 1
        else:
            db.add(SeasonalRate(unit_id=u.id, name=r_name, start_date=s_dt, end_date=e_dt, nightly_rate=Decimal(r_amt)))
            db.flush()
            counts["rates_created"] += 1

    # 5. Availability Blocks (non-overlapping with demo bookings)
    block_specs = [
        (
            "Lagoon 203 - Cove Pool Villa",
            today + timedelta(days=1),
            today + timedelta(days=6),
            "Maintenance",
            "Plunge pool filtration pump replacement",
            "Engineering crew replacing circulation pump and resealing deck tiles.",
        ),
        (
            "Canopy 302 - Cloud Loft",
            today + timedelta(days=24),
            today + timedelta(days=28),
            "Owner",
            "Owner family winter hold",
            "Reserved for ownership family retreat.",
        ),
    ]
    for u_name, s_dt, e_dt, b_type, reason, desc in block_specs:
        u = units_by_name[u_name]
        existing = db.query(UnitBlock).filter(UnitBlock.unit_id == u.id, UnitBlock.reason == reason).first()
        if existing:
            counts["skipped_existing"] += 1
        else:
            db.add(
                UnitBlock(
                    unit_id=u.id,
                    start_date=s_dt,
                    end_date=e_dt,
                    block_type=b_type,
                    reason=reason,
                    description=desc,
                )
            )
            db.flush()
            counts["blocks_created"] += 1

    # 6. Guest Service Catalogue
    service_specs = [
        ("Private Floating Breakfast", "Artisanal breakfast platter served poolside in-villa", "1850.00", True),
        ("Chauffeur Airport Transfer", "Private SUV pickup or drop-off with refreshments", "3500.00", True),
        ("Private Bonfire & BBQ Evening", "Dedicated host, courtyard firepit, and coastal grill", "4200.00", True),
        ("Guided Rainforest Nature Walk", "Morning naturalist-led trail tour for up to 4 guests", "1500.00", True),
        ("In-Villa Private Chef Dinner", "4-course customized tasting menu cooked live", "6500.00", True),
        ("Seasonal Kayak Excursion", "Guided lagoon kayak session (seasonal off-peak)", "2100.00", False),
    ]
    services_by_name = {}
    for name, desc, price, active in service_specs:
        existing = db.query(VillaService).filter(VillaService.name == name).first()
        if existing:
            counts["skipped_existing"] += 1
            services_by_name[name] = existing
        else:
            row = VillaService(name=name, description=desc, price=Decimal(price), is_active=active)
            db.add(row)
            db.flush()
            counts["services_created"] += 1
            services_by_name[name] = row

    # 7. Demo Villas Operational Staff (role=STAFF, distinct from existing manager accounts)
    staff_specs = [
        ("concierge@villas.local", "Raghavendra Kulkarni", "VILLA-DEMO-01", "9820001001", "Senior Villa Concierge"),
        ("housekeeping@villas.local", "Nandini Sawant", "VILLA-DEMO-02", "9820001002", "Executive Housekeeper"),
    ]
    staff_rows = []
    for email, full_name, code, phone, desig in staff_specs:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                full_name=full_name,
                email=email,
                password_hash=hash_password("VillaStaffDemo@2026"),
                role=UserRole.STAFF,
                business_context="VILLA",
                is_active=True,
            )
            db.add(user)
            db.flush()
        st = db.query(Staff).filter(Staff.employee_code == code).first()
        if st:
            counts["skipped_existing"] += 1
            staff_rows.append(st)
        else:
            st = Staff(user_id=user.id, employee_code=code, phone=phone, designation=desig)
            db.add(st)
            db.flush()
            counts["staff_created"] += 1
            staff_rows.append(st)

    # 8. Isolated Villa Guests
    guest_specs = [
        ("V-GST-DEMO0001", "Aarav Malhotra", "9810101001", "aarav.malhotra@demo.in", "14 Worli Sea Face", "Mumbai", "Maharashtra", "Feather pillows, late check-out when available", "Repeat VIP guest"),
        ("V-GST-DEMO0002", "Meera Deshpande", "9810101002", "meera.deshpande@demo.in", "8 Koregaon Park Lane 4", "Pune", "Maharashtra", "Vegetarian tasting menu, quiet ridge suite", "Anniversary preference"),
        ("V-GST-DEMO0003", "Kabir & Rhea Kapoor", "9810101003", "kabir.kapoor@demo.in", "22 Indiranagar 100ft Rd", "Bengaluru", "Karnataka", "Airport transfer required, extra coffee pods", "Corporate retreat"),
        ("V-GST-DEMO0004", "Vikramaditya Menon", "9810101004", "v.menon@demo.in", "Panampilly Nagar", "Kochi", "Kerala", "Ground floor access preferred", "Family stay"),
        ("V-GST-DEMO0005", "Ananya Chatterjee", "9810101005", "ananya.c@demo.in", "Park Street", "Kolkata", "West Bengal", "Herbal tea tray in evening", "Solo wellness escape"),
        ("V-GST-DEMO0006", "Siddharth Joshi (Inactive)", "9810101006", "s.joshi.old@demo.in", "Satellite Road", "Ahmedabad", "Gujarat", "Archived legacy profile", "Deactivated sample"),
    ]
    guests_by_ref = {}
    for idx, (ref, name, phone, email, addr, city, state, pref, notes) in enumerate(guest_specs):
        existing = db.query(VillaGuest).filter(VillaGuest.guest_reference == ref).first()
        if existing:
            counts["skipped_existing"] += 1
            guests_by_ref[ref] = existing
        else:
            row = VillaGuest(
                guest_reference=ref,
                full_name=name,
                phone=phone,
                email=email,
                address=addr,
                city=city,
                state=state,
                country="India",
                preferences=pref,
                notes=notes,
                is_active=(idx != 5),
            )
            db.add(row)
            db.flush()
            counts["guests_created"] += 1
            guests_by_ref[ref] = row

    # 9. Demo Stay Bookings covering full lifecycle, invoices, payments, refunds, services
    booking_specs = [
        {
            "booking_number": "STAY-DEMO-0001",
            "unit": "Sahyadri 101 - Infinity Pool",
            "guest_ref": "V-GST-DEMO0001",
            "check_in": today - timedelta(days=9),
            "check_out": today - timedelta(days=6),
            "guests": 2,
            "status": StayStatus.CHECKED_OUT.value,
            "notes": "Completed anniversary stay",
            "services": [("DEMO Private Floating Breakfast", 1, "Completed"), ("DEMO Chauffeur Airport Transfer", 1, "Completed")],
            "payments": [("UPI", "DEMO-PAY-0001", "full")],
            "refund": None,
            "reason": "Checked out cleanly with full settlement.",
        },
        {
            "booking_number": "STAY-DEMO-0002",
            "unit": "Lagoon 201 - Palm Courtyard",
            "guest_ref": "V-GST-DEMO0002",
            "check_in": today - timedelta(days=5),
            "check_out": today - timedelta(days=3),
            "guests": 2,
            "status": StayStatus.CHECKED_OUT.value,
            "notes": "Completed weekend getaway",
            "services": [("DEMO Guided Rainforest Nature Walk", 2, "Completed")],
            "payments": [("Card", "DEMO-PAY-0002", "full")],
            "refund": None,
            "reason": "Guest departed; invoice finalized and settled.",
        },
        {
            "booking_number": "STAY-DEMO-0003",
            "unit": "Sahyadri 101 - Infinity Pool",
            "guest_ref": "V-GST-DEMO0001",
            "check_in": today - timedelta(days=1),
            "check_out": today + timedelta(days=2),
            "guests": 3,
            "status": StayStatus.CHECKED_IN.value,
            "notes": "Repeat guest in residence",
            "services": [("DEMO Private Bonfire & BBQ Evening", 1, "Completed"), ("DEMO In-Villa Private Chef Dinner", 1, "Scheduled")],
            "payments": [("Net Banking", "DEMO-PAY-0003", Decimal("15000.00"))],
            "refund": None,
            "reason": "Checked in smoothly after villa inspection.",
        },
        {
            "booking_number": "STAY-DEMO-0004",
            "unit": "Canopy 301 - Whispering Pines",
            "guest_ref": "V-GST-DEMO0003",
            "check_in": today - timedelta(days=2),
            "check_out": today,
            "guests": 2,
            "status": StayStatus.CHECKED_IN.value,
            "notes": "Scheduled departure today",
            "services": [("DEMO Chauffeur Airport Transfer", 1, "In Progress")],
            "payments": [("UPI", "DEMO-PAY-0004", Decimal("10000.00"))],
            "refund": None,
            "reason": "In-house guest checking out today.",
        },
        {
            "booking_number": "STAY-DEMO-0005",
            "unit": "Sahyadri 102 - Valley Terrace",
            "guest_ref": "V-GST-DEMO0004",
            "check_in": today,
            "check_out": today + timedelta(days=3),
            "guests": 4,
            "status": StayStatus.CONFIRMED.value,
            "notes": "Arrival expected 2 PM today",
            "services": [],
            "payments": [("Card", "DEMO-PAY-0005", Decimal("12000.00"))],
            "refund": None,
            "reason": "Booking confirmed with advance deposit.",
        },
        {
            "booking_number": "STAY-DEMO-0006",
            "unit": "Canopy 302 - Cloud Loft",
            "guest_ref": "V-GST-DEMO0005",
            "check_in": today + timedelta(days=4),
            "check_out": today + timedelta(days=7),
            "guests": 2,
            "status": StayStatus.CONFIRMED.value,
            "notes": "Confirmed solo nature retreat",
            "services": [],
            "payments": [("UPI", "DEMO-PAY-0006", Decimal("8000.00"))],
            "refund": None,
            "reason": "Confirmed by guest via UPI advance.",
        },
        {
            "booking_number": "STAY-DEMO-0007",
            "unit": "Lagoon 201 - Palm Courtyard",
            "guest_ref": "V-GST-DEMO0001",
            "check_in": today + timedelta(days=11),
            "check_out": today + timedelta(days=13),
            "guests": 2,
            "status": StayStatus.RESERVED.value,
            "notes": "Tentative festive long weekend hold",
            "services": [],
            "payments": [],
            "refund": None,
            "reason": "Provisional reservation created.",
        },
        {
            "booking_number": "STAY-DEMO-0008",
            "unit": "Canopy 302 - Cloud Loft",
            "guest_ref": "V-GST-DEMO0002",
            "check_in": today + timedelta(days=15),
            "check_out": today + timedelta(days=17),
            "guests": 2,
            "status": StayStatus.CANCELLED.value,
            "notes": "Cancelled due to rescheduled flights",
            "services": [],
            "payments": [("UPI", "DEMO-PAY-0008", Decimal("5000.00"))],
            "refund": ("UPI", "DEMO-REV-0008", Decimal("5000.00"), "Guest flight rescheduled; full advance refunded"),
            "reason": "Guest flight rescheduled; full advance refunded.",
        },
        {
            "booking_number": "STAY-DEMO-0009",
            "unit": "Lagoon 202 - Backwater Deck",
            "guest_ref": "V-GST-DEMO0003",
            "check_in": today - timedelta(days=4),
            "check_out": today - timedelta(days=2),
            "guests": 2,
            "status": StayStatus.NO_SHOW.value,
            "notes": "Guest unreachable on arrival day",
            "services": [],
            "payments": [],
            "refund": None,
            "reason": "Guest did not arrive by cutoff.",
        },
    ]

    for spec in booking_specs:
        existing = db.query(StayBooking).filter(StayBooking.booking_number == spec["booking_number"]).first()
        if existing:
            counts["skipped_existing"] += 1
            continue

        unit = units_by_name[spec["unit"]]
        guest = guests_by_ref[spec["guest_ref"]]
        rate, total = _rate_for_dates(db, unit, spec["check_in"], spec["check_out"])

        booking = StayBooking(
            booking_number=spec["booking_number"],
            unit_id=unit.id,
            guest_id=guest.id,
            customer_id=None,
            created_by=manager.id,
            check_in=spec["check_in"],
            check_out=spec["check_out"],
            guests=spec["guests"],
            nightly_rate=rate,
            total_amount=total,
            status=spec["status"],
            notes=spec["notes"],
        )
        db.add(booking)
        db.flush()
        counts["bookings_created"] += 1

        # Record realistic lifecycle status trail
        record_booking_status_history(
            db,
            booking_id=booking.id,
            previous_status=None,
            new_status=StayStatus.RESERVED.value,
            changed_by=manager.id,
            reason="Booking created.",
        )
        if spec["status"] in {StayStatus.CONFIRMED.value, StayStatus.CHECKED_IN.value, StayStatus.CHECKED_OUT.value}:
            record_booking_status_history(
                db,
                booking_id=booking.id,
                previous_status=StayStatus.RESERVED.value,
                new_status=StayStatus.CONFIRMED.value,
                changed_by=manager.id,
                reason="Reservation confirmed.",
            )
        if spec["status"] in {StayStatus.CHECKED_IN.value, StayStatus.CHECKED_OUT.value}:
            record_booking_status_history(
                db,
                booking_id=booking.id,
                previous_status=StayStatus.CONFIRMED.value,
                new_status=StayStatus.CHECKED_IN.value,
                changed_by=manager.id,
                reason="Guest checked in.",
            )
        if spec["status"] == StayStatus.CHECKED_OUT.value:
            record_booking_status_history(
                db,
                booking_id=booking.id,
                previous_status=StayStatus.CHECKED_IN.value,
                new_status=StayStatus.CHECKED_OUT.value,
                changed_by=manager.id,
                reason=spec["reason"],
            )
        elif spec["status"] in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}:
            record_booking_status_history(
                db,
                booking_id=booking.id,
                previous_status=StayStatus.CONFIRMED.value,
                new_status=spec["status"],
                changed_by=manager.id,
                reason=spec["reason"],
            )

        # Service requests
        for svc_idx, (svc_name, qty, req_status) in enumerate(spec["services"]):
            svc = services_by_name[svc_name]
            assigned_staff = staff_rows[svc_idx % len(staff_rows)] if staff_rows else None
            db.add(
                ServiceRequest(
                    booking_id=booking.id,
                    service_id=svc.id,
                    staff_id=assigned_staff.id if assigned_staff else None,
                    quantity=qty,
                    unit_price=svc.price,
                    status=req_status,
                    notes="Demo guest service order",
                )
            )
            counts["service_requests_created"] += 1
        db.flush()

        # Sync invoice, payments, and refunds atomically without intermediate commits
        is_void = spec["status"] in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}
        is_finalized = spec["status"] == StayStatus.CHECKED_OUT.value
        invoice = sync_villa_invoice(
            db,
            booking,
            finalize=is_finalized or is_void,
        )

        # Record advance / full payments
        first_payment = None
        for method, pay_ref, amt_spec in spec["payments"]:
            pay_amt = money(invoice.total_amount) if amt_spec == "full" else money(amt_spec)
            pay_amt = min(pay_amt, money(invoice.total_amount))
            if pay_amt > Decimal("0.00"):
                pay_row = VillaPayment(
                    invoice_id=invoice.id,
                    amount=pay_amt,
                    method=method,
                    reference=pay_ref,
                    received_by=manager.id,
                )
                db.add(pay_row)
                db.flush()
                counts["payments_created"] += 1
                if not first_payment:
                    first_payment = pay_row

        # Record refund & void invoice when applicable
        if spec["refund"] and first_payment is not None:
            r_method, r_ref, r_amt, r_reason = spec["refund"]
            rev_row = VillaPaymentReversal(
                payment_id=first_payment.id,
                invoice_id=invoice.id,
                refund_amount=money(r_amt),
                refund_method=r_method,
                refund_reference=r_ref,
                reason=r_reason,
                reversal_status="Refunded",
                recorded_by=manager.id,
            )
            db.add(rev_row)
            db.flush()
            counts["refunds_created"] += 1

        fin = compute_invoice_financials(db, invoice)
        invoice.paid_amount = fin["paid_amount"]
        if is_void:
            invoice.payment_status = "Void"
            invoice.is_finalized = True
        else:
            invoice.payment_status = derive_invoice_payment_status(
                money(invoice.total_amount),
                fin["paid_amount"],
                fin["refunded_amount"],
                current_status=invoice.payment_status,
            )
        db.flush()

    if apply:
        db.commit()
    else:
        db.rollback()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Idempotent Villas & Units demo data seeder.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Preview changes without committing.")
    mode.add_argument("--apply", action="store_true", help="Apply demo seed idempotently.")
    parser.add_argument("--db-url", default=os.environ.get("DATABASE_URL", ""), help="Optional target SQLite URL.")
    args = parser.parse_args()

    db_url = args.db_url or os.environ.get("DATABASE_URL", "")
    validate_target_database(db_url)

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        summary = run_seed(db, apply=bool(args.apply))
        label = "APPLIED" if args.apply else "DRY-RUN (no changes committed)"
        print(f"[{label}] Target DB: {db_url}")
        for key, value in summary.items():
            print(f"  {key}: {value}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
