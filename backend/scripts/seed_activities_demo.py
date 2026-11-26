"""Idempotent demo seed script for the isolated Activities development database (newaraai_activities_dev).

Usage:
    python backend/scripts/seed_activities_demo.py --dry-run   # preview
    python backend/scripts/seed_activities_demo.py --apply     # insert

Requirements:
    - newaraai_activities_dev database must exist and migrations must be applied.
    - Activities Manager account must already be provisioned.
    - Idempotent: safe to run multiple times; existing demo records are skipped.
    - Demo records are prefixed with [DEMO] or use codes starting with DEMO-.
"""

from __future__ import annotations

import argparse
import datetime
import os
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

ENV_FILE = BACKEND_ROOT / ".env.activities.local"
if ENV_FILE.is_file():
    load_dotenv(ENV_FILE, override=True)

from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.date_utils import get_kolkata_today
from app.db.session import OPERATIONAL_DB_NAMES
from app.models import Customer, Invoice, Payment, User
from app.models.activities import (
    Activity,
    ActivityBooking,
    ActivityBookingHistory,
    ActivityBookingStatus,
    ActivityBookingType,
    ActivityCategory,
    ActivityParticipant,
    ActivityResource,
    ActivitySchedule,
    ActivitySession,
    ActivityStatus,
    ActivityUsageLog,
    AttendanceStatus,
    SessionStatus,
    generate_activity_booking_number,
)
from app.models.entities import PaymentMethod, PaymentStatus


def get_db_url() -> str:
    url = os.environ.get("ACTIVITIES_DEV_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set. Load .env.activities.local first.")
    parsed = make_url(url)
    db_name = (parsed.database or "").strip()
    if db_name in OPERATIONAL_DB_NAMES:
        raise RuntimeError(f"Refusing to seed operational database '{db_name}'.")
    if db_name != "newaraai_activities_dev" and "activit" not in db_name.lower():
        raise RuntimeError(f"Unexpected database '{db_name}'. Expected newaraai_activities_dev.")
    return url


def seed(dry_run: bool = True) -> None:
    db_url = get_db_url()
    engine = create_engine(db_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    today = get_kolkata_today()

    with Session() as db:
        with db.begin():
            mode = "DRY RUN" if dry_run else "APPLY"
            print(f"\n{'='*60}")
            print(f"  Activities Demo Seed — {mode} (today={today})")
            print(f"{'='*60}\n")

            staff_user = (
                db.query(User)
                .filter(User.email == "activities.manager@newaraai.dev")
                .first()
            )
            if staff_user is None:
                print("[INFO] activities.manager@newaraai.dev not found — sessions will be unassigned.")
            instructor_id = staff_user.id if staff_user else None

            # 1. Activities (8 total: 2 time_slot, 4 session, 2 walk_in)
            activities_data = [
                dict(
                    name="[DEMO] Tennis Court Booking",
                    activity_code="DEMO-TENNIS",
                    category=ActivityCategory.OUTDOOR.value,
                    booking_type=ActivityBookingType.TIME_SLOT.value,
                    description="Reserve a floodlit resort tennis court for your preferred time slot.",
                    location_name="Resort Tennis Courts",
                    duration_minutes=60,
                    min_participants=1,
                    max_participants=4,
                    min_age=5,
                    max_age=None,
                    price_per_person=None,
                    price_per_group=Decimal("800.00"),
                    requires_waiver=False,
                    is_complimentary=False,
                    safety_notes="Non-marking court shoes required. Equipment available at reception.",
                    required_equipment="Tennis racket and balls (available on request)",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Private Mountain Tour",
                    activity_code="DEMO-MTN-TOUR",
                    category=ActivityCategory.ADVENTURE.value,
                    booking_type=ActivityBookingType.TIME_SLOT.value,
                    description="A private guided mountain excursion tailored to your group pace.",
                    location_name="Mountain Trail Head",
                    duration_minutes=180,
                    min_participants=1,
                    max_participants=6,
                    min_age=10,
                    max_age=65,
                    price_per_person=Decimal("2500.00"),
                    price_per_group=None,
                    requires_waiver=True,
                    is_complimentary=False,
                    safety_notes="Appropriate hiking gear required. Medical fitness advised.",
                    required_equipment="Hiking boots, rain jacket, water (provided)",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Morning Yoga",
                    activity_code="DEMO-YOGA",
                    category=ActivityCategory.INDOOR.value,
                    booking_type=ActivityBookingType.SESSION.value,
                    description="Energizing sunrise yoga session led by certified wellness instructors.",
                    location_name="Wellness Pavilion",
                    duration_minutes=60,
                    min_participants=3,
                    max_participants=12,
                    min_age=14,
                    max_age=None,
                    price_per_person=Decimal("600.00"),
                    price_per_group=None,
                    requires_waiver=False,
                    is_complimentary=True,
                    safety_notes="Inform instructor of any injuries before class.",
                    required_equipment="Yoga mat (provided)",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Guided Nature Walk",
                    activity_code="DEMO-NATURE-WALK",
                    category=ActivityCategory.NATURE.value,
                    booking_type=ActivityBookingType.SESSION.value,
                    description="Explore the resort woodland trails with our resident naturalist.",
                    location_name="Nature Trail Entrance",
                    duration_minutes=90,
                    min_participants=2,
                    max_participants=10,
                    min_age=5,
                    max_age=None,
                    price_per_person=Decimal("450.00"),
                    price_per_group=None,
                    requires_waiver=False,
                    is_complimentary=False,
                    safety_notes="Wear comfortable shoes and sun protection.",
                    required_equipment="Water bottle, hat",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Adventure Trekking",
                    activity_code="DEMO-TREK",
                    category=ActivityCategory.ADVENTURE.value,
                    booking_type=ActivityBookingType.SESSION.value,
                    description="Guided group trekking expedition along scenic ridge trails.",
                    location_name="Adventure Base Camp",
                    duration_minutes=180,
                    min_participants=4,
                    max_participants=8,
                    min_age=16,
                    max_age=60,
                    price_per_person=Decimal("1800.00"),
                    price_per_group=None,
                    requires_waiver=True,
                    is_complimentary=False,
                    safety_notes="Medical fitness required. Signed waiver mandatory before trek.",
                    required_equipment="Trekking poles, sturdy boots",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Sunset Photography Tour",
                    activity_code="DEMO-PHOTO",
                    category=ActivityCategory.TOUR.value,
                    booking_type=ActivityBookingType.SESSION.value,
                    description="Golden-hour landscape photography session at Viewpoint Summit.",
                    location_name="Viewpoint Summit",
                    duration_minutes=120,
                    min_participants=2,
                    max_participants=6,
                    min_age=None,
                    max_age=None,
                    price_per_person=Decimal("1200.00"),
                    price_per_group=None,
                    requires_waiver=False,
                    is_complimentary=False,
                    safety_notes="Bring your own camera or smartphone; tripods available.",
                    required_equipment="Camera / Smartphone, tripod (provided)",
                    default_staff_id=instructor_id,
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Kayaking",
                    activity_code="DEMO-KAYAK",
                    category=ActivityCategory.WATER.value,
                    booking_type=ActivityBookingType.WALK_IN.value,
                    description="Drop-in kayaking on the calm resort lagoon.",
                    location_name="Lagoon Jetty",
                    duration_minutes=60,
                    min_participants=1,
                    max_participants=2,
                    min_age=10,
                    max_age=None,
                    price_per_person=Decimal("500.00"),
                    price_per_group=None,
                    requires_waiver=True,
                    is_complimentary=False,
                    safety_notes="Life jacket mandatory at all times on the water.",
                    required_equipment="Life jacket and paddle (provided)",
                    status=ActivityStatus.ACTIVE.value,
                ),
                dict(
                    name="[DEMO] Indoor Recreation Centre",
                    activity_code="DEMO-IRC",
                    category=ActivityCategory.INDOOR.value,
                    booking_type=ActivityBookingType.WALK_IN.value,
                    description="Complimentary access to table tennis, billiards, and board games.",
                    location_name="Recreation Centre, Block C",
                    duration_minutes=120,
                    min_participants=1,
                    max_participants=20,
                    min_age=None,
                    max_age=None,
                    price_per_person=None,
                    price_per_group=None,
                    requires_waiver=False,
                    is_complimentary=True,
                    safety_notes=None,
                    required_equipment=None,
                    status=ActivityStatus.ACTIVE.value,
                ),
            ]

            activity_map: dict[str, Activity] = {}
            for a_data in activities_data:
                existing = (
                    db.query(Activity)
                    .filter(
                        Activity.business_context == "ACTIVITY",
                        Activity.activity_code == a_data["activity_code"],
                    )
                    .first()
                )
                if existing:
                    print(f"  [SKIP] Activity '{a_data['activity_code']}' already exists.")
                    activity_map[a_data["activity_code"]] = existing
                    continue
                if not dry_run:
                    act = Activity(business_context="ACTIVITY", created_by=instructor_id, **a_data)
                    db.add(act)
                    db.flush()
                    activity_map[a_data["activity_code"]] = act
                    print(f"  [CREATE] Activity: {a_data['name']}")
                else:
                    print(f"  [WOULD CREATE] Activity: {a_data['name']}")

            # 2. Resources (for time_slot activities)
            resources_data = [
                dict(activity_code="DEMO-TENNIS", name="[DEMO] Tennis Court 1", description="Clay surface court with floodlights", capacity=4, is_active=True),
                dict(activity_code="DEMO-TENNIS", name="[DEMO] Tennis Court 2", description="All-weather hard court", capacity=4, is_active=True),
                dict(activity_code="DEMO-MTN-TOUR", name="[DEMO] Mountain Guide — Alex", description="Senior alpine trail guide", capacity=6, is_active=True),
                dict(activity_code="DEMO-MTN-TOUR", name="[DEMO] Mountain Guide — Priya", description="Botanical & ridge guide", capacity=6, is_active=True),
            ]

            resource_map: dict[str, ActivityResource] = {}
            for r_data in resources_data:
                code = r_data.pop("activity_code")
                act = activity_map.get(code)
                if act is None:
                    continue
                existing = (
                    db.query(ActivityResource)
                    .filter(
                        ActivityResource.activity_id == act.id,
                        ActivityResource.name == r_data["name"],
                    )
                    .first()
                )
                if existing:
                    resource_map[r_data["name"]] = existing
                    print(f"  [SKIP] Resource '{r_data['name']}' already exists.")
                    continue
                if not dry_run:
                    res = ActivityResource(activity_id=act.id, **r_data)
                    db.add(res)
                    db.flush()
                    resource_map[r_data["name"]] = res
                    print(f"  [CREATE] Resource: {r_data['name']}")
                else:
                    print(f"  [WOULD CREATE] Resource: {r_data['name']}")

            # 3. Weekly Schedules (for session activities)
            schedules_data = [
                dict(
                    activity_code="DEMO-YOGA",
                    valid_from=today,
                    valid_to=today + datetime.timedelta(days=90),
                    operating_weekdays="0,1,2,3,4",
                    start_time=datetime.time(7, 0),
                    end_time=datetime.time(8, 0),
                    default_capacity=12,
                    default_staff_id=instructor_id,
                    notes="[DEMO] Weekday morning yoga",
                ),
                dict(
                    activity_code="DEMO-NATURE-WALK",
                    valid_from=today,
                    valid_to=today + datetime.timedelta(days=60),
                    operating_weekdays="1,3,5",
                    start_time=datetime.time(8, 30),
                    end_time=datetime.time(10, 0),
                    default_capacity=10,
                    default_staff_id=instructor_id,
                    notes="[DEMO] Tue/Thu/Sat nature walk",
                ),
                dict(
                    activity_code="DEMO-TREK",
                    valid_from=today,
                    valid_to=today + datetime.timedelta(days=60),
                    operating_weekdays="5,6",
                    start_time=datetime.time(6, 0),
                    end_time=datetime.time(9, 0),
                    default_capacity=8,
                    default_staff_id=instructor_id,
                    notes="[DEMO] Weekend ridge trekking",
                ),
                dict(
                    activity_code="DEMO-PHOTO",
                    valid_from=today,
                    valid_to=today + datetime.timedelta(days=90),
                    operating_weekdays="2,4,6",
                    start_time=datetime.time(16, 30),
                    end_time=datetime.time(18, 30),
                    default_capacity=6,
                    default_staff_id=instructor_id,
                    notes="[DEMO] Sunset photography tour",
                ),
            ]

            schedule_map: dict[str, ActivitySchedule] = {}
            for s_data in schedules_data:
                code = s_data.pop("activity_code")
                act = activity_map.get(code)
                if act is None:
                    continue
                existing = (
                    db.query(ActivitySchedule)
                    .filter(
                        ActivitySchedule.activity_id == act.id,
                        ActivitySchedule.start_time == s_data["start_time"],
                    )
                    .first()
                )
                if existing:
                    schedule_map[code] = existing
                    print(f"  [SKIP] Schedule for '{code}' already exists.")
                    continue
                if not dry_run:
                    sched = ActivitySchedule(activity_id=act.id, **s_data)
                    db.add(sched)
                    db.flush()
                    schedule_map[code] = sched
                    print(f"  [CREATE] Schedule for activity {code}")
                else:
                    print(f"  [WOULD CREATE] Schedule for activity {code}")

            # 4. Sessions (12 sessions: today + upcoming + past)
            session_specs = [
                ("DEMO-YOGA", 0, datetime.time(7, 0), datetime.time(8, 0), 4, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Today morning yoga (full test)"),
                ("DEMO-NATURE-WALK", 0, datetime.time(9, 30), datetime.time(11, 0), 10, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Today nature walk (below minimum alert test)"),
                ("DEMO-PHOTO", 0, datetime.time(16, 30), datetime.time(18, 30), 6, None, SessionStatus.SCHEDULED.value, "[DEMO] Today sunset photo (unassigned instructor alert test)"),
                ("DEMO-YOGA", 1, datetime.time(7, 0), datetime.time(8, 0), 12, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Tomorrow morning yoga"),
                ("DEMO-NATURE-WALK", 2, datetime.time(8, 30), datetime.time(10, 0), 10, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Guided nature walk"),
                ("DEMO-TREK", 3, datetime.time(6, 0), datetime.time(9, 0), 8, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Adventure trek (waiver required)"),
                ("DEMO-TREK", 5, datetime.time(6, 0), datetime.time(9, 0), 8, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Upcoming adventure trek"),
                ("DEMO-PHOTO", 2, datetime.time(16, 30), datetime.time(18, 30), 6, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Sunset photography"),
                ("DEMO-YOGA", 4, datetime.time(7, 0), datetime.time(8, 0), 12, instructor_id, SessionStatus.SCHEDULED.value, "[DEMO] Midweek yoga"),
                ("DEMO-YOGA", -2, datetime.time(7, 0), datetime.time(8, 0), 12, instructor_id, SessionStatus.COMPLETED.value, "[DEMO] Completed morning yoga"),
                ("DEMO-NATURE-WALK", -1, datetime.time(8, 30), datetime.time(10, 0), 10, instructor_id, SessionStatus.COMPLETED.value, "[DEMO] Completed nature walk"),
                ("DEMO-TREK", 7, datetime.time(6, 0), datetime.time(9, 0), 8, instructor_id, SessionStatus.CANCELLED.value, "[DEMO] Cancelled due to trail maintenance"),
            ]

            session_objects: list[ActivitySession] = []
            for act_code, day_offset, st, et, cap, staff_id, stat, note in session_specs:
                act = activity_map.get(act_code)
                if act is None:
                    continue
                session_date = today + datetime.timedelta(days=day_offset)
                existing = (
                    db.query(ActivitySession)
                    .filter(
                        ActivitySession.activity_id == act.id,
                        ActivitySession.session_date == session_date,
                        ActivitySession.start_time == st,
                    )
                    .first()
                )
                if existing:
                    session_objects.append(existing)
                    print(f"  [SKIP] Session for '{act_code}' on {session_date} already exists.")
                    continue
                if not dry_run:
                    sess = ActivitySession(
                        activity_id=act.id,
                        schedule_id=schedule_map[act_code].id if act_code in schedule_map else None,
                        session_date=session_date,
                        start_time=st,
                        end_time=et,
                        capacity=cap,
                        assigned_staff_id=staff_id,
                        status=stat,
                        notes=note,
                        cancelled_reason="Trail maintenance" if stat == SessionStatus.CANCELLED.value else None,
                    )
                    db.add(sess)
                    db.flush()
                    session_objects.append(sess)
                    print(f"  [CREATE] Session: {act_code} on {session_date} ({stat})")
                else:
                    print(f"  [WOULD CREATE] Session: {act_code} on {session_date} ({stat})")

            # 5. Demo Customers (6)
            customers_data = [
                dict(full_name="[DEMO] Arjun Sharma", email="demo.arjun@example.com", phone="9876543210", address="Banjara Hills, Hyderabad"),
                dict(full_name="[DEMO] Emily Chen", email="demo.emily@example.com", phone="9876543211", address="Indiranagar, Bengaluru"),
                dict(full_name="[DEMO] Marcus Weber", email="demo.marcus@example.com", phone="9876543212", address="Bandra West, Mumbai"),
                dict(full_name="[DEMO] Sofia Costa", email="demo.sofia@example.com", phone="9876543213", address="Panaji, Goa"),
                dict(full_name="[DEMO] Hiroshi Tanaka", email="demo.hiroshi@example.com", phone="9876543214", address="Koregaon Park, Pune"),
                dict(full_name="[DEMO] Fatima Al-Rashid", email="demo.fatima@example.com", phone="9876543215", address="Jubilee Hills, Hyderabad"),
            ]

            customer_objects: list[Customer] = []
            for c_data in customers_data:
                existing = db.query(Customer).filter(Customer.email == c_data["email"]).first()
                if existing:
                    customer_objects.append(existing)
                    print(f"  [SKIP] Customer '{c_data['email']}' already exists.")
                    continue
                if not dry_run:
                    cust = Customer(**c_data)
                    db.add(cust)
                    db.flush()
                    customer_objects.append(cust)
                    print(f"  [CREATE] Customer: {c_data['full_name']}")
                else:
                    print(f"  [WOULD CREATE] Customer: {c_data['full_name']}")

            # 6. Bookings + Participants + Invoices (covering session AND time_slot)
            if not dry_run and session_objects and customer_objects:
                yoga_today = next(
                    (s for s in session_objects if s.session_date == today and s.activity_id == activity_map["DEMO-YOGA"].id),
                    None,
                )
                walk_today = next(
                    (s for s in session_objects if s.session_date == today and s.activity_id == activity_map["DEMO-NATURE-WALK"].id),
                    None,
                )
                trek_future = next(
                    (s for s in session_objects if s.activity_id == activity_map["DEMO-TREK"].id and s.status == SessionStatus.SCHEDULED.value),
                    None,
                )
                completed_yoga = next(
                    (s for s in session_objects if s.status == SessionStatus.COMPLETED.value),
                    None,
                )

                session_booking_specs = [
                    (yoga_today, customer_objects[0], 4, ActivityBookingStatus.CONFIRMED.value, True),
                    (walk_today, customer_objects[1], 1, ActivityBookingStatus.PENDING.value, False),
                    (trek_future, customer_objects[2], 2, ActivityBookingStatus.CONFIRMED.value, False),
                    (trek_future, customer_objects[3], 2, ActivityBookingStatus.CANCELLED.value, True),
                    (completed_yoga, customer_objects[4], 2, ActivityBookingStatus.COMPLETED.value, True),
                    (completed_yoga, customer_objects[5], 1, ActivityBookingStatus.NO_SHOW.value, True),
                ]

                for sess, cust_obj, p_count, bstatus, waiver_ok in session_booking_specs:
                    if sess is None:
                        continue
                    act = db.get(Activity, sess.activity_id)
                    if act is None:
                        continue
                    existing_bk = (
                        db.query(ActivityBooking)
                        .filter(
                            ActivityBooking.session_id == sess.id,
                            ActivityBooking.customer_id == cust_obj.id,
                        )
                        .first()
                    )
                    if existing_bk:
                        print(f"  [SKIP] Session booking for {cust_obj.full_name} already exists.")
                        continue

                    pricing_method = "complimentary" if act.is_complimentary else "per_person"
                    unit_price = Decimal("0.00") if act.is_complimentary else (act.price_per_person or Decimal("0.00"))
                    total_amt = unit_price * p_count

                    bk = ActivityBooking(
                        business_context="ACTIVITY",
                        booking_number=generate_activity_booking_number(),
                        activity_id=act.id,
                        customer_id=cust_obj.id,
                        session_id=sess.id,
                        booking_date=sess.session_date,
                        participant_count=p_count,
                        booking_type_snapshot=act.booking_type,
                        activity_name_snapshot=act.name,
                        pricing_method=pricing_method,
                        unit_price_snapshot=unit_price,
                        total_amount=total_amt,
                        status=bstatus,
                        cancellation_reason="Guest requested reschedule" if bstatus == ActivityBookingStatus.CANCELLED.value else None,
                        cancelled_at=datetime.datetime.now(datetime.timezone.utc) if bstatus == ActivityBookingStatus.CANCELLED.value else None,
                        notes="[DEMO] Seeded session booking",
                        created_by=instructor_id,
                    )
                    db.add(bk)
                    db.flush()

                    db.add(ActivityBookingHistory(
                        booking_id=bk.id,
                        action="CREATED",
                        previous_status=None,
                        new_status=bstatus,
                        reason="Demo seed booking",
                        changed_by=instructor_id,
                    ))

                    for pi in range(p_count):
                        db.add(ActivityParticipant(
                            booking_id=bk.id,
                            participant_name=cust_obj.full_name if pi == 0 else f"{cust_obj.full_name} Guest {pi + 1}",
                            age=24 + pi * 4,
                            waiver_signed=waiver_ok if act.requires_waiver else True,
                            attendance_status=(
                                AttendanceStatus.PRESENT.value
                                if bstatus == ActivityBookingStatus.COMPLETED.value
                                else AttendanceStatus.NO_SHOW.value
                                if bstatus == ActivityBookingStatus.NO_SHOW.value
                                else AttendanceStatus.PENDING.value
                            ),
                        ))
                    print(f"  [CREATE] Session Booking: {bk.booking_number} ({act.name}, {bstatus})")

                    if total_amt > 0 and bstatus in (ActivityBookingStatus.CONFIRMED.value, ActivityBookingStatus.COMPLETED.value):
                        gst_rate = Decimal("18.00")
                        gst_amt = (total_amt * gst_rate / Decimal("100")).quantize(Decimal("0.01"))
                        inv_total = total_amt + gst_amt
                        paid_amt = inv_total if bstatus == ActivityBookingStatus.COMPLETED.value else Decimal("0.00")
                        bal_amt = inv_total - paid_amt
                        inv = Invoice(
                            source_module="ACTIVITY",
                            source_reference_id=bk.id,
                            source_reference_number=bk.booking_number,
                            customer_id=cust_obj.id,
                            subtotal=total_amt,
                            gst_rate=gst_rate,
                            gst_amount=gst_amt,
                            total_amount=inv_total,
                            paid_amount=paid_amt,
                            balance_due=bal_amt,
                            payment_status=PaymentStatus.PAID if bal_amt == 0 else PaymentStatus.PENDING,
                            notes="[DEMO] Activity booking invoice",
                        )
                        db.add(inv)
                        db.flush()
                        if paid_amt > 0:
                            db.add(Payment(
                                invoice_id=inv.id,
                                payment_method=PaymentMethod.UPI,
                                amount=paid_amt,
                                status=PaymentStatus.PAID,
                                reference_number="DEMO-UPI-1001",
                                payment_type="Full",
                                paid_at=datetime.datetime.now(datetime.timezone.utc),
                                source_module="ACTIVITY",
                                received_by=instructor_id,
                            ))

                court1 = resource_map.get("[DEMO] Tennis Court 1")
                guide1 = resource_map.get("[DEMO] Mountain Guide — Alex")
                timeslot_specs = [
                    ("DEMO-TENNIS", court1, customer_objects[0], today, datetime.time(10, 0), datetime.time(11, 0), 2, "per_group", ActivityBookingStatus.CONFIRMED.value),
                    ("DEMO-TENNIS", court1, customer_objects[1], today + datetime.timedelta(days=1), datetime.time(17, 0), datetime.time(18, 0), 4, "per_group", ActivityBookingStatus.PENDING.value),
                    ("DEMO-MTN-TOUR", guide1, customer_objects[2], today + datetime.timedelta(days=2), datetime.time(7, 30), datetime.time(10, 30), 3, "per_person", ActivityBookingStatus.CONFIRMED.value),
                ]
                for act_code, res_obj, cust_obj, s_date, st, et, p_count, pm, bstatus in timeslot_specs:
                    act = activity_map.get(act_code)
                    if act is None or res_obj is None:
                        continue
                    existing_ts = (
                        db.query(ActivityBooking)
                        .filter(
                            ActivityBooking.resource_id == res_obj.id,
                            ActivityBooking.slot_date == s_date,
                            ActivityBooking.slot_start_time == st,
                        )
                        .first()
                    )
                    if existing_ts:
                        print(f"  [SKIP] Time-slot booking on {res_obj.name} ({s_date}) already exists.")
                        continue
                    unit_price = (act.price_per_group if pm == "per_group" else act.price_per_person) or Decimal("0.00")
                    total_amt = unit_price if pm == "per_group" else (unit_price * p_count)
                    bk = ActivityBooking(
                        business_context="ACTIVITY",
                        booking_number=generate_activity_booking_number(),
                        activity_id=act.id,
                        customer_id=cust_obj.id,
                        resource_id=res_obj.id,
                        booking_date=s_date,
                        slot_date=s_date,
                        slot_start_time=st,
                        slot_end_time=et,
                        participant_count=p_count,
                        booking_type_snapshot="time_slot",
                        activity_name_snapshot=act.name,
                        pricing_method=pm,
                        unit_price_snapshot=unit_price,
                        total_amount=total_amt,
                        status=bstatus,
                        notes="[DEMO] Time slot reservation",
                        created_by=instructor_id,
                    )
                    db.add(bk)
                    db.flush()
                    db.add(ActivityBookingHistory(
                        booking_id=bk.id,
                        action="CREATED",
                        previous_status=None,
                        new_status=bstatus,
                        reason="Demo time-slot booking",
                        changed_by=instructor_id,
                    ))
                    for pi in range(p_count):
                        db.add(ActivityParticipant(
                            booking_id=bk.id,
                            participant_name=cust_obj.full_name if pi == 0 else f"{cust_obj.full_name} Player {pi + 1}",
                            age=28 + pi * 3,
                            waiver_signed=not act.requires_waiver,
                            attendance_status=AttendanceStatus.PENDING.value,
                        ))
                    print(f"  [CREATE] Time-Slot Booking: {bk.booking_number} ({res_obj.name})")

                    if total_amt > 0 and bstatus == ActivityBookingStatus.CONFIRMED.value:
                        gst_rate = Decimal("18.00")
                        gst_amt = (total_amt * gst_rate / Decimal("100")).quantize(Decimal("0.01"))
                        inv_total = total_amt + gst_amt
                        inv = Invoice(
                            source_module="ACTIVITY",
                            source_reference_id=bk.id,
                            source_reference_number=bk.booking_number,
                            customer_id=cust_obj.id,
                            subtotal=total_amt,
                            gst_rate=gst_rate,
                            gst_amount=gst_amt,
                            total_amount=inv_total,
                            paid_amount=inv_total,
                            balance_due=Decimal("0.00"),
                            payment_status=PaymentStatus.PAID,
                            notes="[DEMO] Time-slot activity invoice",
                        )
                        db.add(inv)
                        db.flush()
                        db.add(Payment(
                            invoice_id=inv.id,
                            payment_method=PaymentMethod.CARD,
                            amount=inv_total,
                            status=PaymentStatus.PAID,
                            reference_number="DEMO-CARD-2001",
                            payment_type="Full",
                            paid_at=datetime.datetime.now(datetime.timezone.utc),
                            source_module="ACTIVITY",
                            received_by=instructor_id,
                        ))

            # 7. Walk-in Usage Logs (for DEMO-KAYAK and DEMO-IRC)
            walkin_logs = [
                dict(
                    activity_code="DEMO-KAYAK",
                    customer_idx=0,
                    usage_date=today,
                    usage_time=datetime.time(10, 15),
                    participant_count=1,
                    amount_charged=Decimal("500.00"),
                    notes="[DEMO] Morning solo kayaking",
                ),
                dict(
                    activity_code="DEMO-KAYAK",
                    customer_idx=1,
                    usage_date=today,
                    usage_time=datetime.time(11, 30),
                    participant_count=2,
                    amount_charged=Decimal("1000.00"),
                    notes="[DEMO] Couple kayaking session",
                ),
                dict(
                    activity_code="DEMO-IRC",
                    customer_idx=3,
                    usage_date=today,
                    usage_time=datetime.time(14, 0),
                    participant_count=4,
                    amount_charged=Decimal("0.00"),
                    notes="[DEMO] Family recreation centre walk-in",
                ),
                dict(
                    activity_code="DEMO-IRC",
                    customer_idx=None,
                    usage_date=today - datetime.timedelta(days=1),
                    usage_time=datetime.time(16, 0),
                    participant_count=2,
                    amount_charged=Decimal("0.00"),
                    notes="[DEMO] Guest table tennis walk-in",
                ),
            ]

            for log_data in walkin_logs:
                code = log_data.pop("activity_code")
                c_idx = log_data.pop("customer_idx")
                act = activity_map.get(code)
                if act is None:
                    continue
                cust_id = customer_objects[c_idx].id if (c_idx is not None and c_idx < len(customer_objects)) else None
                existing_log = (
                    db.query(ActivityUsageLog)
                    .filter(
                        ActivityUsageLog.activity_id == act.id,
                        ActivityUsageLog.notes == log_data["notes"],
                    )
                    .first()
                )
                if existing_log:
                    print(f"  [SKIP] Usage log '{log_data['notes']}' exists.")
                    continue
                if not dry_run:
                    db.add(
                        ActivityUsageLog(
                            activity_id=act.id,
                            customer_id=cust_id,
                            recorded_by=instructor_id,
                            **log_data,
                        )
                    )
                    print(f"  [CREATE] Walk-in log: {log_data['notes']}")
                else:
                    print(f"  [WOULD CREATE] Walk-in log: {log_data['notes']}")

            if dry_run:
                db.rollback()
                print("\n[DRY RUN] No changes committed. Run with --apply to persist.")
            else:
                print("\n[APPLY] All demo records committed successfully.")

    engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Seed Activities demo data")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Preview without writing")
    group.add_argument("--apply", action="store_true", help="Persist demo data")
    args = parser.parse_args()
    seed(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
