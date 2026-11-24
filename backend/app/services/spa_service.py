from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

from app.core.config import settings
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.models.spa import (
    SpaBooking,
    SpaBookingService,
    SpaBookingStatusHistory,
    SpaBookingStatus,
    SpaCustomer,
    SpaInvoice,
    SpaInvoiceItem,
    SpaPayment,
    SpaPaymentStatus,
    SpaService,
    SpaStaff,
    SpaStaffAvailability,
    generate_spa_booking_number,
    generate_spa_invoice_number,
    generate_spa_payment_reference,
)


BACKEND_ROOT = Path(__file__).resolve().parents[2]
SPA_INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "spa-invoices"
SPA_INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)


# ==========================================
# TIME HELPERS
# ==========================================

def parse_time_string(val: str | time) -> time:
    if isinstance(val, time):
        return val
    parts = val.strip().split(":")
    h = int(parts[0])
    m = int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return time(hour=h, minute=m, second=s)


def time_to_seconds(t: time) -> int:
    return t.hour * 3600 + t.minute * 60 + t.second


def seconds_to_time(sec: int) -> time:
    sec = sec % (24 * 3600)
    h = sec // 3600
    rem = sec % 3600
    m = rem // 60
    s = rem % 60
    return time(hour=h, minute=m, second=s)


def add_minutes_to_time(t: time, minutes: int) -> time:
    sec = time_to_seconds(t) + minutes * 60
    return seconds_to_time(sec)


# ==========================================
# THERAPIST CONFLICT & SCHEDULING VALIDATION
# ==========================================

def validate_therapist_availability_and_conflict(
    db: Session,
    staff_id: int,
    booking_date: date,
    start_time: time,
    end_time: time,
    exclude_booking_id: int | None = None,
) -> SpaStaff:
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found."
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Staff member {staff.full_name} is currently inactive and cannot accept bookings."
        )

    if not staff.is_therapist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{staff.full_name} is designated as non-therapist staff and cannot be assigned to treatment bookings."
        )

    # 1. Operating hours check (10:00 - 18:00)
    spa_open = parse_time_string(settings.SPA_OPENING_TIME)
    spa_close = parse_time_string(settings.SPA_CLOSING_TIME)
    if start_time < spa_open or end_time > spa_close:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Selected time ({start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}) is outside Spa operating hours ({settings.SPA_OPENING_TIME} - {settings.SPA_CLOSING_TIME})."
        )

    # 2. Past date / time check in Asia/Kolkata timezone
    kolkata_now = get_kolkata_now()
    kolkata_today = kolkata_now.date()
    if booking_date < kolkata_today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book an appointment for a past date."
        )
    if booking_date == kolkata_today and start_time <= kolkata_now.time():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot book an appointment for a past time. Current time is {kolkata_now.strftime('%H:%M')}."
        )

    # 3. Check weekly working availability if schedule is configured
    day_of_week = booking_date.weekday()  # 0=Monday, 6=Sunday
    avail_records = (
        db.query(SpaStaffAvailability)
        .filter(
            SpaStaffAvailability.staff_id == staff_id,
            SpaStaffAvailability.day_of_week == day_of_week
        )
        .all()
    )

    if avail_records:
        matching_slot = None
        for av in avail_records:
            if av.is_available:
                if av.start_time <= start_time and av.end_time >= end_time:
                    matching_slot = av
                    break
        if not matching_slot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Therapist {staff.full_name} is not scheduled to work during {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')} on this day."
            )

    # 4. Overlap conflict query with mandatory therapist reset buffer
    # Every appointment has a mandatory break immediately following therapy duration.
    buffer_min = getattr(settings, "SPA_THERAPY_BUFFER_MINUTES", 15)
    new_reserved_end = add_minutes_to_time(end_time, buffer_min)

    conflict_query = (
        db.query(SpaBooking)
        .filter(
            SpaBooking.staff_id == staff_id,
            SpaBooking.booking_date == booking_date,
            SpaBooking.status.notin_([SpaBookingStatus.CANCELLED.value, SpaBookingStatus.NO_SHOW.value]),
        )
    )

    if exclude_booking_id is not None:
        conflict_query = conflict_query.filter(SpaBooking.id != exclude_booking_id)

    active_bookings = conflict_query.all()
    for b in active_bookings:
        b_reserved_end = add_minutes_to_time(b.end_time, buffer_min)
        if start_time < b_reserved_end and new_reserved_end > b.start_time:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Scheduling conflict: The selected time slot is no longer available. Please select another time."
            )

    return staff


def generate_available_slots(
    db: Session,
    staff_id: int,
    booking_date: date,
    service_items: list[dict] | None = None,
    total_duration_minutes: int | None = None,
    exclude_booking_id: int | None = None,
) -> dict:
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Therapist not found."
        )

    if not staff.is_active or not staff.is_therapist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{staff.full_name} is not available for treatments."
        )

    # 1. Determine total duration
    if service_items:
        duration, _, _ = calculate_services_duration_and_total(db, service_items)
    elif total_duration_minutes and total_duration_minutes > 0:
        duration = total_duration_minutes
    elif exclude_booking_id:
        existing = db.get(SpaBooking, exclude_booking_id)
        if existing and existing.booking_services:
            duration = sum(bs.duration_minutes * bs.quantity for bs in existing.booking_services)
        else:
            duration = 30
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Treatment services or duration must be specified to generate slots."
        )

    if duration <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Treatment duration must be greater than zero."
        )

    # 2. Operating hours
    spa_open = parse_time_string(settings.SPA_OPENING_TIME)
    spa_close = parse_time_string(settings.SPA_CLOSING_TIME)
    interval_min = settings.SPA_SLOT_INTERVAL_MINUTES

    # 3. Weekly therapist availability windows
    day_of_week = booking_date.weekday()
    avail_records = (
        db.query(SpaStaffAvailability)
        .filter(
            SpaStaffAvailability.staff_id == staff_id,
            SpaStaffAvailability.day_of_week == day_of_week,
        )
        .all()
    )

    windows = []
    if avail_records:
        for av in avail_records:
            if av.is_available:
                w_start = max(spa_open, av.start_time)
                w_end = min(spa_close, av.end_time)
                if w_start < w_end:
                    windows.append((w_start, w_end))
    else:
        windows.append((spa_open, spa_close))

    # 4. Past time in Asia/Kolkata
    kolkata_now = get_kolkata_now()
    kolkata_today = kolkata_now.date()
    current_time = kolkata_now.time()

    is_past_date = booking_date < kolkata_today
    is_today = booking_date == kolkata_today

    if is_past_date:
        return {
            "booking_date": booking_date,
            "staff_id": staff_id,
            "therapist_name": staff.full_name,
            "total_duration_minutes": duration,
            "slots": [],
        }

    # 5. Active bookings for conflict check
    conflict_query = (
        db.query(SpaBooking)
        .filter(
            SpaBooking.staff_id == staff_id,
            SpaBooking.booking_date == booking_date,
            SpaBooking.status.notin_([SpaBookingStatus.CANCELLED.value, SpaBookingStatus.NO_SHOW.value]),
        )
    )
    if exclude_booking_id:
        conflict_query = conflict_query.filter(SpaBooking.id != exclude_booking_id)
    active_bookings = conflict_query.all()

    # 6. Candidate slot generation accounting for mandatory 15-minute therapy break buffer
    # Exactly 6 discrete fixed appointment slots across 10:00 AM - 06:00 PM operating hours:
    # 1. 10:00 AM - 11:00 AM (Break until 11:15 AM)
    # 2. 11:15 AM - 12:15 PM (Break until 12:30 PM)
    # 3. 12:30 PM - 01:30 PM (Break until 01:45 PM)
    # 4. 01:45 PM - 02:45 PM (Break until 03:00 PM)
    # 5. 03:00 PM - 04:00 PM (Break until 04:15 PM)
    # 6. 04:15 PM - 05:15 PM (Break until 05:30 PM)
    buffer_min = getattr(settings, "SPA_THERAPY_BUFFER_MINUTES", 15)
    slots = []
    seen_starts = set()

    FIXED_SLOT_STARTS = [
        time(10, 0),
        time(11, 15),
        time(12, 30),
        time(13, 45),
        time(15, 0),
        time(16, 15),
    ]

    for cand_start in FIXED_SLOT_STARTS:
        cand_end = add_minutes_to_time(cand_start, duration)
        cand_reserved_end = add_minutes_to_time(cand_end, buffer_min)

        # Exclude past times if today
        if is_today and cand_start <= current_time:
            continue

        # Check therapist availability windows
        in_window = any(
            w_start <= cand_start and cand_end <= w_end
            for w_start, w_end in windows
        )
        if not in_window:
            continue

        # Treatment session must complete within spa operating hours
        if cand_end > spa_close:
            continue

        # Check overlap with existing active bookings:
        # Overlap exists if candidate therapy+break interval overlaps active booking therapy+break interval
        has_overlap = False
        for b in active_bookings:
            b_reserved_end = add_minutes_to_time(b.end_time, buffer_min)
            if cand_start < b_reserved_end and cand_reserved_end > b.start_time:
                has_overlap = True
                break

        start_str = cand_start.strftime("%H:%M")
        if not has_overlap and start_str not in seen_starts:
            seen_starts.add(start_str)
            end_str = cand_end.strftime("%H:%M")
            buffer_end_str = cand_reserved_end.strftime("%H:%M")

            disp_start = datetime.strptime(start_str, "%H:%M").strftime("%I:%M %p")
            disp_end = datetime.strptime(end_str, "%H:%M").strftime("%I:%M %p")
            display_text = f"{disp_start} - {disp_end}"

            slots.append({
                "start_time": start_str,
                "end_time": end_str,
                "buffer_end_time": buffer_end_str,
                "display_text": display_text,
                "available": True,
            })

    slots.sort(key=lambda s: s["start_time"])

    return {
        "booking_date": booking_date,
        "staff_id": staff_id,
        "therapist_name": staff.full_name,
        "total_duration_minutes": duration,
        "buffer_minutes": buffer_min,
        "slots": slots,
    }


# ==========================================
# BOOKING CREATION & SERVICE SNAPSHOTS
# ==========================================

def calculate_services_duration_and_total(
    db: Session,
    service_items: list[dict],
) -> tuple[int, Decimal, list[dict]]:
    total_duration = 0
    estimated_total = Decimal("0.00")
    snapshots = []

    for item in service_items:
        s_id = item["service_id"]
        qty = int(item.get("quantity", 1))
        if qty <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service quantity must be at least 1."
            )

        service = db.get(SpaService, s_id)
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Service ID {s_id} not found."
            )

        if not service.is_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Service '{service.name}' is currently unavailable for new bookings."
            )

        subtotal = round(service.price * qty, 2)
        total_duration += (service.duration_minutes * qty)
        estimated_total += subtotal

        snapshots.append({
            "service_id": service.id,
            "service_name": service.name,
            "unit_price": service.price,
            "duration_minutes": service.duration_minutes,
            "quantity": qty,
            "subtotal": subtotal,
        })

    return total_duration, estimated_total, snapshots


def create_booking_record(
    db: Session,
    customer_id: int | None,
    new_customer_data: dict | None,
    staff_id: int,
    booking_date: date,
    start_time_str: str,
    service_items: list[dict],
    notes: str | None,
    created_by_user_id: int | None,
) -> SpaBooking:
    # Row-level lock on therapist to guarantee concurrency safety
    staff_q = db.query(SpaStaff).filter(SpaStaff.id == staff_id)
    if db.bind and db.bind.dialect.name == "postgresql":
        staff_q = staff_q.with_for_update()
    locked_staff = staff_q.first()
    if not locked_staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found."
        )

    # 1. Resolve or create customer
    if new_customer_data:
        customer = SpaCustomer(
            full_name=new_customer_data["full_name"].strip(),
            phone=new_customer_data["phone"].strip(),
            email=new_customer_data.get("email"),
            notes=new_customer_data.get("notes"),
            is_active=True,
        )
        db.add(customer)
        db.flush()
        customer_id = customer.id
    else:
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either an existing customer_id or new_customer details must be provided."
            )
        customer = db.get(SpaCustomer, customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found."
            )

    # 2. Calculate duration and end time
    start_time = parse_time_string(start_time_str)
    total_duration, estimated_total, service_snapshots = calculate_services_duration_and_total(
        db, service_items
    )

    start_sec = time_to_seconds(start_time)
    end_sec = start_sec + (total_duration * 60)
    end_time = seconds_to_time(end_sec)

    # 3. Check therapist availability & conflicts
    validate_therapist_availability_and_conflict(
        db, staff_id, booking_date, start_time, end_time
    )

    # 4. Create booking
    booking = SpaBooking(
        booking_number=generate_spa_booking_number(),
        customer_id=customer_id,
        staff_id=staff_id,
        booking_date=booking_date,
        start_time=start_time,
        end_time=end_time,
        status=SpaBookingStatus.BOOKED.value,
        estimated_total=estimated_total,
        notes=notes,
        created_by=created_by_user_id,
    )
    db.add(booking)
    db.flush()

    # 5. Create service snapshot items
    for snap in service_snapshots:
        b_service = SpaBookingService(
            booking_id=booking.id,
            service_id=snap["service_id"],
            service_name=snap["service_name"],
            unit_price=snap["unit_price"],
            duration_minutes=snap["duration_minutes"],
            quantity=snap["quantity"],
            subtotal=snap["subtotal"],
        )
        db.add(b_service)

    # 6. Record status history
    history = SpaBookingStatusHistory(
        booking_id=booking.id,
        previous_status=None,
        new_status=SpaBookingStatus.BOOKED.value,
        changed_by=created_by_user_id,
        note="Booking created in Booked status.",
    )
    db.add(history)

    db.commit()
    db.refresh(booking)
    return booking


# ==========================================
# STATUS TRANSITION WORKFLOW
# ==========================================

ALLOWED_SPA_TRANSITIONS: dict[str, set[str]] = {
    # Primary Three-Stage Operational Workflow
    SpaBookingStatus.BOOKED.value: {
        SpaBookingStatus.IN_PROGRESS.value,
        SpaBookingStatus.CANCELLED.value,
    },
    SpaBookingStatus.IN_PROGRESS.value: {
        SpaBookingStatus.COMPLETED.value,
        SpaBookingStatus.CANCELLED.value,
    },
    SpaBookingStatus.COMPLETED.value: set(),
    SpaBookingStatus.CANCELLED.value: set(),
    SpaBookingStatus.NO_SHOW.value: set(),
    # Backward compatibility for legacy scheduled statuses
    SpaBookingStatus.PENDING.value: {
        SpaBookingStatus.IN_PROGRESS.value,
        SpaBookingStatus.CANCELLED.value,
    },
    SpaBookingStatus.CONFIRMED.value: {
        SpaBookingStatus.IN_PROGRESS.value,
        SpaBookingStatus.CANCELLED.value,
    },
    SpaBookingStatus.CHECKED_IN.value: {
        SpaBookingStatus.IN_PROGRESS.value,
        SpaBookingStatus.CANCELLED.value,
    },
}


def transition_booking_status(
    db: Session,
    booking_id: int,
    new_status_raw: str,
    changed_by_user_id: int | None,
    note: str | None = None,
) -> SpaBooking:
    booking = db.get(SpaBooking, booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found."
        )

    # Standardize casing
    match_status = None
    for st in SpaBookingStatus:
        if st.value.lower() == new_status_raw.strip().lower():
            match_status = st.value
            break

    if not match_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid booking status '{new_status_raw}'. Allowed: {[s.value for s in SpaBookingStatus]}"
        )

    current_status = booking.status
    if current_status == match_status:
        return booking

    allowed = ALLOWED_SPA_TRANSITIONS.get(current_status, set())
    if match_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid transition from '{current_status}' to '{match_status}'. "
                f"Allowed transitions from '{current_status}': {list(allowed) if allowed else 'None (terminal state)'}."
            )
        )

    if match_status == SpaBookingStatus.COMPLETED.value:
        scheduled_end = datetime.combine(booking.booking_date, booking.end_time)
        if get_kolkata_now().replace(tzinfo=None) < scheduled_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Therapy session has not ended yet. You can mark it complete after "
                    f"{booking.end_time.strftime('%I:%M %p')} on {booking.booking_date.isoformat()}."
                ),
            )

    booking.status = match_status
    history = SpaBookingStatusHistory(
        booking_id=booking.id,
        previous_status=current_status,
        new_status=match_status,
        changed_by=changed_by_user_id,
        note=note or f"Status transitioned from {current_status} to {match_status}.",
    )
    db.add(history)
    db.commit()
    db.refresh(booking)
    return booking


# ==========================================
# RESCHEDULING
# ==========================================

def reschedule_booking(
    db: Session,
    booking_id: int,
    new_date: date,
    new_start_time_str: str,
    new_staff_id: int | None,
    changed_by_user_id: int | None,
) -> SpaBooking:
    booking = db.get(SpaBooking, booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found."
        )

    if booking.status in [
        SpaBookingStatus.COMPLETED.value,
        SpaBookingStatus.CANCELLED.value,
        SpaBookingStatus.NO_SHOW.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reschedule a booking in '{booking.status}' status."
        )

    staff_id = new_staff_id if new_staff_id is not None else booking.staff_id
    # Row-level lock on therapist to guarantee concurrency safety
    staff_q = db.query(SpaStaff).filter(SpaStaff.id == staff_id)
    if db.bind and db.bind.dialect.name == "postgresql":
        staff_q = staff_q.with_for_update()
    locked_staff = staff_q.first()
    if not locked_staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found."
        )

    new_start_time = parse_time_string(new_start_time_str)

    # Calculate total duration from existing snapshotted booking services
    total_duration = sum(bs.duration_minutes * bs.quantity for bs in booking.booking_services)
    if total_duration <= 0:
        total_duration = 30  # fallback

    start_sec = time_to_seconds(new_start_time)
    end_sec = start_sec + (total_duration * 60)
    new_end_time = seconds_to_time(end_sec)

    # Re-validate therapist conflict and availability on new date/time
    validate_therapist_availability_and_conflict(
        db=db,
        staff_id=staff_id,
        booking_date=new_date,
        start_time=new_start_time,
        end_time=new_end_time,
        exclude_booking_id=booking.id,
    )

    prev_info = f"{booking.booking_date} {booking.start_time.strftime('%H:%M')}"
    booking.booking_date = new_date
    booking.start_time = new_start_time
    booking.end_time = new_end_time
    booking.staff_id = staff_id

    history = SpaBookingStatusHistory(
        booking_id=booking.id,
        previous_status=booking.status,
        new_status=booking.status,
        changed_by=changed_by_user_id,
        note=f"Rescheduled from {prev_info} to {new_date} {new_start_time.strftime('%H:%M')}.",
    )
    db.add(history)
    db.commit()
    db.refresh(booking)
    return booking


# ==========================================
# INVOICE GENERATION & PDF CREATION
# ==========================================

def format_inr(value: Decimal | float | None) -> str:
    return f"INR {Decimal(str(value or 0)):,.2f}"


def generate_spa_invoice_pdf(invoice: SpaInvoice) -> str:
    filename = f"spa-invoice-{invoice.id}-{invoice.invoice_number}.pdf"
    pdf_path = SPA_INVOICE_PDF_DIR / filename

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "SpaHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1C1917"),
    )
    sub_style = ParagraphStyle(
        "SpaSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#78716C"),
    )
    meta_title = ParagraphStyle(
        "MetaTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1C1917"),
    )
    meta_val = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#44403C"),
    )
    right_text = ParagraphStyle(
        "RightText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#44403C"),
    )
    right_bold = ParagraphStyle(
        "RightBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#1C1917"),
    )

    story = []

    # Title & Branding
    brand_table = Table(
        [
            [
                Paragraph("<b>DINEFLOW SPA & WELLNESS</b>", header_style),
                Paragraph(f"<b>INVOICE</b><br/><font color='#78716C'>{escape(invoice.invoice_number)}</font>", right_bold),
            ],
            [
                Paragraph("Luxury Holistic Spa & Therapy Centre", sub_style),
                Paragraph(f"Date: {invoice.created_at.strftime('%d-%b-%Y')}", right_text),
            ]
        ],
        colWidths=[100 * mm, 80 * mm]
    )
    brand_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(brand_table)
    story.append(Spacer(1, 8 * mm))

    # Customer & Booking Info Box
    cust = invoice.customer
    booking = invoice.booking
    therapist_name = booking.therapist.full_name if booking.therapist else "Assigned Specialist"

    info_data = [
        [
            Paragraph("<b>BILLED TO</b>", meta_title),
            Paragraph("<b>APPOINTMENT DETAILS</b>", meta_title),
        ],
        [
            Paragraph(f"<b>{escape(cust.full_name)}</b><br/>Phone: {escape(cust.phone)}<br/>Email: {escape(cust.email or 'N/A')}", meta_val),
            Paragraph(f"Booking #: <b>{escape(booking.booking_number)}</b><br/>Date: {booking.booking_date.strftime('%d-%b-%Y')}<br/>Time: {booking.start_time.strftime('%H:%M')} - {booking.end_time.strftime('%H:%M')}<br/>Therapist: {escape(therapist_name)}", meta_val),
        ]
    ]
    info_table = Table(info_data, colWidths=[90 * mm, 90 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E7E5E4")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8 * mm))

    # Line Items Table
    item_rows = [
        [
            Paragraph("<b>#</b>", meta_title),
            Paragraph("<b>Service Description</b>", meta_title),
            Paragraph("<b>Qty</b>", meta_title),
            Paragraph("<b>Unit Price</b>", right_bold),
            Paragraph("<b>GST Rate</b>", right_bold),
            Paragraph("<b>Total</b>", right_bold),
        ]
    ]

    for idx, item in enumerate(invoice.items, start=1):
        item_rows.append([
            Paragraph(str(idx), meta_val),
            Paragraph(escape(item.service_name), meta_val),
            Paragraph(str(item.quantity), meta_val),
            Paragraph(format_inr(item.unit_price), right_text),
            Paragraph(f"{item.tax_rate}%", right_text),
            Paragraph(format_inr(item.total_amount), right_bold),
        ])

    items_table = Table(item_rows, colWidths=[10 * mm, 75 * mm, 15 * mm, 25 * mm, 25 * mm, 30 * mm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F5F5F4")),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#1C1917")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#E7E5E4")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    # Summary Table
    summary_data = [
        [Paragraph("Subtotal:", right_text), Paragraph(format_inr(invoice.subtotal), right_text)],
        [Paragraph(f"GST ({invoice.tax_rate}%):", right_text), Paragraph(format_inr(invoice.tax_amount), right_text)],
    ]
    if invoice.discount_amount and invoice.discount_amount > 0:
        summary_data.append([
            Paragraph("Discount:", right_text),
            Paragraph(f"- {format_inr(invoice.discount_amount)}", right_text)
        ])
    summary_data.extend([
        [Paragraph("<b>Grand Total:</b>", right_bold), Paragraph(f"<b>{format_inr(invoice.total_amount)}</b>", right_bold)],
        [Paragraph("Amount Paid:", right_text), Paragraph(format_inr(invoice.paid_amount), right_text)],
        [Paragraph("<b>Balance Due:</b>", right_bold), Paragraph(f"<b><font color='#EA580C'>{format_inr(invoice.balance_due)}</font></b>", right_bold)],
        [Paragraph("Status:", right_text), Paragraph(f"<b>{invoice.payment_status.upper()}</b>", right_text)],
    ])

    summary_table = Table(summary_data, colWidths=[130 * mm, 50 * mm])
    summary_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, 2), (-1, 2), 0.5, colors.HexColor("#1C1917")),
    ]))
    story.append(summary_table)

    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E7E5E4")))
    story.append(Spacer(1, 4 * mm))
    footer_text = Paragraph(
        "Thank you for visiting DineFlow Spa & Wellness. For inquiries or re-booking, please contact reception.",
        ParagraphStyle("Footer", parent=styles["Normal"], alignment=TA_CENTER, fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#A8A29E"))
    )
    story.append(footer_text)

    doc.build(story)
    return str(pdf_path)


def generate_spa_invoice(
    db: Session,
    booking_id: int,
    tax_rate: Decimal | None = None,
    discount_amount: Decimal = Decimal("0.00"),
) -> SpaInvoice:
    booking = db.get(SpaBooking, booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found."
        )

    if booking.status != SpaBookingStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoices can only be generated for Completed bookings. Current status: '{booking.status}'."
        )

    # Check for existing invoice
    existing = db.query(SpaInvoice).filter(SpaInvoice.booking_id == booking_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoice already generated for this booking (Invoice #{existing.invoice_number})."
        )

    if not booking.booking_services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate invoice: Booking has no services."
        )

    # Calculate subtotal, tax and total
    subtotal = Decimal("0.00")
    for bs in booking.booking_services:
        subtotal += bs.subtotal

    if tax_rate is None:
        from app.core.config import settings
        tax_rate = Decimal(str(settings.SPA_DEFAULT_TAX_RATE))
    else:
        tax_rate = Decimal(str(tax_rate))

    discount_amount = Decimal(str(discount_amount or 0))

    tax_multiplier = tax_rate / Decimal("100")
    tax_amount = (subtotal * tax_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_amount = (subtotal + tax_amount - discount_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    balance_due = total_amount

    invoice = SpaInvoice(
        invoice_number=generate_spa_invoice_number(),
        booking_id=booking.id,
        customer_id=booking.customer_id,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        balance_due=balance_due,
        payment_status=SpaPaymentStatus.PENDING.value,
    )
    db.add(invoice)
    db.flush()

    # Generate invoice item snapshots
    for bs in booking.booking_services:
        item_subtotal = bs.subtotal
        item_tax = (item_subtotal * tax_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        item_total = item_subtotal + item_tax

        inv_item = SpaInvoiceItem(
            invoice_id=invoice.id,
            booking_service_id=bs.id,
            service_name=bs.service_name,
            quantity=bs.quantity,
            unit_price=bs.unit_price,
            tax_rate=tax_rate,
            tax_amount=item_tax,
            subtotal=item_subtotal,
            total_amount=item_total,
        )
        db.add(inv_item)

    db.commit()
    db.refresh(invoice)

    # Generate PDF
    try:
        pdf_path = generate_spa_invoice_pdf(invoice)
        invoice.pdf_path = pdf_path
        db.commit()
        db.refresh(invoice)
    except Exception as exc:
        print(f"[Warning] Failed to generate Spa invoice PDF: {exc}")

    return invoice


# ==========================================
# PAYMENT RECORDING & SETTLEMENT
# ==========================================

def record_spa_payment(
    db: Session,
    invoice_id: int,
    payment_method: str,
    amount: Decimal,
    transaction_reference: str | None,
    received_by_user_id: int | None,
) -> SpaPayment:
    invoice = db.get(SpaInvoice, invoice_id)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spa Invoice not found."
        )

    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be greater than zero."
        )

    if invoice.balance_due <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice is already fully settled. No balance is due."
        )

    if amount > invoice.balance_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount (INR {amount}) exceeds the remaining balance due (INR {invoice.balance_due})."
        )

    payment = SpaPayment(
        invoice_id=invoice.id,
        payment_reference=generate_spa_payment_reference(),
        payment_method=payment_method,
        amount=amount,
        payment_status=SpaPaymentStatus.PAID.value,
        transaction_reference=transaction_reference,
        received_by=received_by_user_id,
        paid_at=get_kolkata_now(),
    )
    db.add(payment)

    # Update invoice financials transactionally
    invoice.paid_amount = (invoice.paid_amount + amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    invoice.balance_due = (invoice.total_amount - invoice.paid_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if invoice.balance_due <= Decimal("0.00"):
        invoice.balance_due = Decimal("0.00")
        invoice.payment_status = SpaPaymentStatus.PAID.value
    else:
        invoice.payment_status = SpaPaymentStatus.PARTIALLY_PAID.value

    db.commit()
    db.refresh(payment)
    db.refresh(invoice)

    # Re-render invoice PDF with updated payment details
    try:
        generate_spa_invoice_pdf(invoice)
    except Exception:
        pass

    return payment
