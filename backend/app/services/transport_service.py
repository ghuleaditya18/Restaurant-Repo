"""Business services for the Transport Management module."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from uuid import uuid4
from xml.sax.saxutils import escape

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.branding import APP_NAME
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.models.entities import Customer, Invoice, Payment, PaymentMethod, PaymentStatus
from app.models.transport import (
    MaintenanceStatus,
    ServicePricingModel,
    TransportAssignment,
    TransportBooking,
    TransportBookingHistory,
    TransportBookingStatus,
    TransportDriver,
    TransportMaintenanceRecord,
    TransportRoute,
    TransportServiceType,
    TransportVehicle,
    TransportVehicleCategory,
    VehicleStatus,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
TRANSPORT_INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "transport-invoices"

DEFAULT_VEHICLE_CATEGORIES = [
    ("Sedan", "Comfortable 4-seater sedans for airport and city transfers.", 4),
    ("SUV", "All-terrain sport utility vehicles for families and hilly routes.", 6),
    ("MUV", "Multi-utility vehicles suited for resort group transfers.", 7),
    ("Luxury Car", "Chauffeured executive & luxury fleet vehicles.", 4),
    ("Tempo Traveller", "Spacious mini-coaches for medium group excursions.", 12),
    ("Mini Bus", "Mid-size resort shuttle buses for group tours.", 20),
    ("Bus", "Full-size passenger coaches for large group transfers.", 40),
    ("Electric Vehicle", "Zero-emission EV fleet for eco-friendly resort mobility.", 4),
]

ACTIVE_TRIP_STATUSES = {
    TransportBookingStatus.ASSIGNED.value,
    TransportBookingStatus.DRIVER_EN_ROUTE.value,
    TransportBookingStatus.IN_PROGRESS.value,
}

ALLOWED_TRIP_TRANSITIONS: dict[str, set[str]] = {
    TransportBookingStatus.PENDING.value: {
        TransportBookingStatus.CONFIRMED.value,
        TransportBookingStatus.ASSIGNED.value,
        TransportBookingStatus.CANCELLED.value,
        TransportBookingStatus.NO_SHOW.value,
    },
    TransportBookingStatus.CONFIRMED.value: {
        TransportBookingStatus.ASSIGNED.value,
        TransportBookingStatus.CANCELLED.value,
        TransportBookingStatus.NO_SHOW.value,
    },
    TransportBookingStatus.ASSIGNED.value: {
        TransportBookingStatus.DRIVER_EN_ROUTE.value,
        TransportBookingStatus.IN_PROGRESS.value,
        TransportBookingStatus.CANCELLED.value,
        TransportBookingStatus.NO_SHOW.value,
    },
    TransportBookingStatus.DRIVER_EN_ROUTE.value: {
        TransportBookingStatus.IN_PROGRESS.value,
        TransportBookingStatus.CANCELLED.value,
        TransportBookingStatus.NO_SHOW.value,
    },
    TransportBookingStatus.IN_PROGRESS.value: {
        TransportBookingStatus.COMPLETED.value,
        TransportBookingStatus.CANCELLED.value,
    },
    TransportBookingStatus.COMPLETED.value: set(),
    TransportBookingStatus.CANCELLED.value: set(),
    TransportBookingStatus.NO_SHOW.value: set(),
}

PAYMENT_METHOD_ENUM_MAP = {
    "Cash": PaymentMethod.CASH,
    "UPI": PaymentMethod.UPI,
    "Card": PaymentMethod.CARD,
    "Net Banking": PaymentMethod.NET_BANKING,
}


def money(value: Decimal | float | int | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def format_inr(value: Decimal | float | int | str | None) -> str:
    return f"INR {money(value):,.2f}"


def parse_hhmm(value: str) -> time:
    parts = value.strip().split(":")
    return time(int(parts[0]), int(parts[1]))


def add_minutes_to_time(start: time, minutes: int) -> time:
    dt = datetime.combine(date(2000, 1, 1), start) + timedelta(minutes=max(1, minutes))
    # Cap within same day 23:59 if crossing midnight for single-day window check
    if dt.date() > date(2000, 1, 1):
        return time(23, 59)
    return dt.time()


def ensure_default_vehicle_categories(db: Session) -> None:
    existing = db.query(TransportVehicleCategory.id).first()
    if existing is not None:
        return
    for name, desc, cap in DEFAULT_VEHICLE_CATEGORIES:
        db.add(
            TransportVehicleCategory(
                name=name,
                description=desc,
                default_capacity=cap,
                is_active=True,
            )
        )
    db.commit()


def calculate_transport_price(
    *,
    service: TransportServiceType | None,
    route: TransportRoute | None,
    estimated_distance_km: Decimal,
    estimated_duration_minutes: int,
    override_base_price: Decimal | None = None,
) -> Decimal:
    if override_base_price is not None:
        return money(override_base_price)

    if service is None:
        return money(route.standard_price) if route else Decimal("0.00")

    base = money(service.base_price)
    km = Decimal(str(estimated_distance_km or 0))
    hours = (Decimal(int(estimated_duration_minutes or 60)) / Decimal("60")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    model = service.pricing_model

    if model == ServicePricingModel.FLAT.value:
        if base > Decimal("0.00"):
            return base
        return money(route.standard_price) if route else base
    if model == ServicePricingModel.PER_KM.value:
        rate = money(service.price_per_km or 0)
        return money(base + (km * rate))
    if model == ServicePricingModel.PER_HOUR.value:
        rate = money(service.price_per_hour or 0)
        return money(base + (hours * rate))
    if model == ServicePricingModel.HYBRID.value:
        km_rate = money(service.price_per_km or 0)
        hr_rate = money(service.price_per_hour or 0)
        return money(base + (km * km_rate) + (hours * hr_rate))
    return base


def has_overlapping_assignment(
    db: Session,
    *,
    scheduled_date: date,
    start_time: time,
    end_time: time,
    vehicle_id: int | None = None,
    driver_id: int | None = None,
    exclude_booking_id: int | None = None,
) -> tuple[bool, str | None]:
    if vehicle_id is not None:
        q = db.query(TransportAssignment).filter(
            TransportAssignment.vehicle_id == vehicle_id,
            TransportAssignment.scheduled_date == scheduled_date,
            TransportAssignment.assignment_status.in_(list(ACTIVE_TRIP_STATUSES)),
            TransportAssignment.start_time < end_time,
            TransportAssignment.end_time > start_time,
        )
        if exclude_booking_id is not None:
            q = q.filter(TransportAssignment.booking_id != exclude_booking_id)
        conflict = q.first()
        if conflict:
            return (
                True,
                f"Vehicle already has an overlapping active assignment ({conflict.start_time.strftime('%H:%M')}–{conflict.end_time.strftime('%H:%M')}).",
            )

    if driver_id is not None:
        q = db.query(TransportAssignment).filter(
            TransportAssignment.driver_id == driver_id,
            TransportAssignment.scheduled_date == scheduled_date,
            TransportAssignment.assignment_status.in_(list(ACTIVE_TRIP_STATUSES)),
            TransportAssignment.start_time < end_time,
            TransportAssignment.end_time > start_time,
        )
        if exclude_booking_id is not None:
            q = q.filter(TransportAssignment.booking_id != exclude_booking_id)
        conflict = q.first()
        if conflict:
            return (
                True,
                f"Driver already has an overlapping active assignment ({conflict.start_time.strftime('%H:%M')}–{conflict.end_time.strftime('%H:%M')}).",
            )

    return False, None


def validate_vehicle_and_driver_for_assignment(
    db: Session,
    *,
    vehicle_id: int,
    driver_id: int,
    passenger_count: int,
    scheduled_date: date,
    start_time: time,
    end_time: time,
    exclude_booking_id: int | None = None,
) -> tuple[TransportVehicle, TransportDriver]:
    # Lock target vehicle and driver rows to prevent concurrent double-assignments
    vehicle = (
        db.query(TransportVehicle)
        .filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False))
        .with_for_update()
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Selected vehicle not found.")
    if not vehicle.is_active or vehicle.status == VehicleStatus.INACTIVE.value:
        raise HTTPException(status_code=409, detail=f"Vehicle '{vehicle.vehicle_name}' is inactive and cannot be assigned.")
    if vehicle.status == VehicleStatus.MAINTENANCE.value:
        raise HTTPException(status_code=409, detail=f"Vehicle '{vehicle.vehicle_name}' is under maintenance and cannot be assigned.")
    if vehicle.seating_capacity < passenger_count:
        raise HTTPException(
            status_code=422,
            detail=f"Vehicle '{vehicle.vehicle_name}' capacity ({vehicle.seating_capacity}) is lower than passenger count ({passenger_count}).",
        )

    driver = (
        db.query(TransportDriver)
        .filter(TransportDriver.id == driver_id, TransportDriver.is_deleted.is_(False))
        .with_for_update()
        .first()
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Selected driver not found.")
    if not driver.is_active or driver.employment_status != "Active":
        raise HTTPException(status_code=409, detail=f"Driver '{driver.driver_name}' is inactive and cannot be assigned.")
    if driver.availability_status in {"On Leave", "Unavailable", "Off Duty"}:
        raise HTTPException(
            status_code=409,
            detail=f"Driver '{driver.driver_name}' is currently '{driver.availability_status}' and unavailable for assignment.",
        )
    if driver.licence_validity < scheduled_date:
        raise HTTPException(
            status_code=409,
            detail=f"Driver '{driver.driver_name}' licence expires before the scheduled trip date ({driver.licence_validity.isoformat()}).",
        )

    overlap, reason = has_overlapping_assignment(
        db,
        scheduled_date=scheduled_date,
        start_time=start_time,
        end_time=end_time,
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        exclude_booking_id=exclude_booking_id,
    )
    if overlap:
        raise HTTPException(status_code=409, detail=reason)

    return vehicle, driver


def sync_vehicle_and_driver_operational_status(db: Session, vehicle_id: int | None, driver_id: int | None) -> None:
    if vehicle_id:
        vehicle = db.get(TransportVehicle, vehicle_id)
        if vehicle and vehicle.is_active:
            has_maint = (
                db.query(TransportMaintenanceRecord.id)
                .filter(
                    TransportMaintenanceRecord.vehicle_id == vehicle_id,
                    TransportMaintenanceRecord.status == MaintenanceStatus.IN_PROGRESS.value,
                )
                .first()
                is not None
            )
            if has_maint:
                vehicle.status = VehicleStatus.MAINTENANCE.value
            else:
                active_on_trip = (
                    db.query(TransportAssignment.id)
                    .filter(
                        TransportAssignment.vehicle_id == vehicle_id,
                        TransportAssignment.assignment_status.in_(
                            [TransportBookingStatus.DRIVER_EN_ROUTE.value, TransportBookingStatus.IN_PROGRESS.value]
                        ),
                    )
                    .first()
                    is not None
                )
                if active_on_trip:
                    vehicle.status = VehicleStatus.ON_TRIP.value
                else:
                    has_assigned = (
                        db.query(TransportAssignment.id)
                        .filter(
                            TransportAssignment.vehicle_id == vehicle_id,
                            TransportAssignment.assignment_status == TransportBookingStatus.ASSIGNED.value,
                        )
                        .first()
                        is not None
                    )
                    vehicle.status = VehicleStatus.ASSIGNED.value if has_assigned else VehicleStatus.AVAILABLE.value

    if driver_id:
        driver = db.get(TransportDriver, driver_id)
        if driver and driver.is_active and driver.availability_status not in {"On Leave", "Unavailable", "Off Duty"}:
            active_on_trip = (
                db.query(TransportAssignment.id)
                .filter(
                    TransportAssignment.driver_id == driver_id,
                    TransportAssignment.assignment_status.in_(
                        [TransportBookingStatus.DRIVER_EN_ROUTE.value, TransportBookingStatus.IN_PROGRESS.value]
                    ),
                )
                .first()
                is not None
            )
            driver.availability_status = "On Trip" if active_on_trip else "Available"


def generate_transport_booking_number(db: Session) -> str:
    year = get_kolkata_today().year
    prefix = f"TRN-{year}-"
    existing = (
        db.query(TransportBooking.booking_number)
        .filter(TransportBooking.booking_number.like(f"{prefix}%"))
        .all()
    )
    max_seq = 0
    for (num,) in existing:
        suffix = num[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:04d}"


ROUTE_TYPE_PREFIX_MAP = {
    "Airport Transfer": "AIR",
    "Railway Station Transfer": "RLY",
    "Local Sightseeing": "SIG",
    "Resort Pickup/Drop": "RES",
    "Intercity Transfer": "INT",
    "Custom Route": "CUS",
}


def generate_unique_route_code(
    db: Session,
    route_type: str = "",
    starting_location: str = "",
    destination: str = "",
) -> str:
    tag = ROUTE_TYPE_PREFIX_MAP.get(route_type.strip(), "RTE")
    prefix = f"RT-{tag}-"
    existing_codes = {
        code
        for (code,) in db.query(TransportRoute.route_code).all()
        if code
    }
    max_seq = 0
    for code in existing_codes:
        if code.startswith(prefix):
            tail = code[len(prefix):]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    seq = max_seq + 1
    candidate = f"{prefix}{seq:03d}"
    while candidate in existing_codes:
        seq += 1
        candidate = f"{prefix}{seq:03d}"
    return candidate


def validate_not_past_pickup(pickup_date: date, pickup_time: time) -> None:
    now_ist = get_kolkata_now().replace(tzinfo=None) - timedelta(minutes=1)
    requested_dt = datetime.combine(pickup_date, pickup_time)
    if requested_dt < now_ist:
        raise HTTPException(
            status_code=422,
            detail="Pickup date and time cannot be in the past. Please choose the current time or an upcoming time.",
        )


def resolve_customer_for_stay(db: Session, stay) -> Customer | None:
    if stay is None:
        return None
    if stay.customer_id:
        existing = db.get(Customer, stay.customer_id)
        if existing:
            return existing
    guest = getattr(stay, "guest", None)
    if not guest:
        return None
    if guest.phone:
        matched = db.query(Customer).filter(Customer.phone == guest.phone).first()
        if matched:
            return matched
    if guest.email:
        matched = db.query(Customer).filter(func.lower(Customer.email) == guest.email.lower()).first()
        if matched:
            return matched
    cust = Customer(
        full_name=guest.full_name,
        phone=guest.phone,
        email=guest.email,
        address=guest.address,
    )
    db.add(cust)
    db.flush()
    return cust


def record_booking_history(
    db: Session,
    *,
    booking_id: int,
    action: str,
    previous_status: str | None,
    new_status: str,
    changed_by: int | None,
    reason: str | None = None,
) -> TransportBookingHistory:
    entry = TransportBookingHistory(
        booking_id=booking_id,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason.strip() if reason else None,
        changed_by=changed_by,
    )
    db.add(entry)
    return entry


def sync_transport_invoice_financials(db: Session, invoice: Invoice) -> Invoice:
    payments = (
        db.query(Payment)
        .filter(
            Payment.invoice_id == invoice.id,
            Payment.source_module == "TRANSPORT",
            Payment.status == PaymentStatus.PAID,
        )
        .all()
    )
    net_paid = Decimal("0.00")
    for p in payments:
        if p.payment_type == "Refund":
            net_paid -= money(p.amount)
        else:
            net_paid += money(p.amount)
    net_paid = max(Decimal("0.00"), money(net_paid))
    total = money(invoice.total_amount)
    balance = max(Decimal("0.00"), money(total - net_paid))

    invoice.paid_amount = net_paid
    invoice.balance_due = balance
    if total == Decimal("0.00") or balance == Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PAID
    elif net_paid > Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PARTIALLY_PAID
    else:
        invoice.payment_status = PaymentStatus.PENDING
    db.flush()
    return invoice


def generate_transport_invoice_pdf(db: Session, invoice: Invoice) -> Path:
    TRANSPORT_INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)
    booking = (
        db.query(TransportBooking)
        .filter(TransportBooking.id == invoice.source_reference_id)
        .first()
        if invoice.source_reference_id
        else None
    )
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else (booking.customer if booking else None)

    pdf_path = TRANSPORT_INVOICE_PDF_DIR / f"{invoice.invoice_number}.pdf"
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=32,
        bottomMargin=32,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TrnTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        textColor=colors.HexColor("#172033"),
        spaceAfter=4,
    )
    muted_style = ParagraphStyle(
        "TrnMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        leading=13,
    )
    section_style = ParagraphStyle(
        "TrnSection",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#172033"),
        spaceBefore=8,
        spaceAfter=4,
    )
    right_style = ParagraphStyle(
        "TrnRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#172033"),
    )
    center_muted = ParagraphStyle(
        "TrnCenterMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748B"),
    )

    elements: list = [
        Paragraph(f"{escape(APP_NAME)} — Transport Tax Invoice", title_style),
        Paragraph(
            f"Invoice #: <b>{escape(invoice.invoice_number)}</b> &nbsp;|&nbsp; "
            f"Booking #: <b>{escape(booking.booking_number if booking else (invoice.source_reference_number or 'N/A'))}</b> &nbsp;|&nbsp; "
            f"Status: <b>{escape(getattr(invoice.payment_status, 'value', str(invoice.payment_status)))}</b>",
            muted_style,
        ),
        Paragraph(f"Issued (IST): {get_kolkata_now().strftime('%d %b %Y, %I:%M %p')}", muted_style),
        Spacer(1, 8),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E5E9F0")),
        Spacer(1, 10),
    ]

    cust_name = customer.full_name if customer else "Guest"
    cust_phone = customer.phone if customer else "—"
    cust_email = customer.email if customer and customer.email else "—"

    trip_details = (
        f"<b>Trip Details</b><br/>"
        f"Type: {escape(booking.booking_type if booking else 'Transport')}<br/>"
        f"Route: {escape(booking.pickup_location)} → {escape(booking.drop_location)}<br/>"
        f"Pickup: {booking.pickup_date} {booking.pickup_time.strftime('%H:%M')} · Passengers: {booking.passenger_count}"
        if booking
        else "<b>Trip Details</b><br/>Transport Service"
    )
    meta_table = Table(
        [
            [
                Paragraph(
                    f"<b>Billed To</b><br/>{escape(cust_name)}<br/>Phone: {escape(cust_phone)}<br/>Email: {escape(cust_email)}",
                    muted_style,
                ),
                Paragraph(trip_details, muted_style),
            ]
        ],
        colWidths=[255, 265],
    )
    meta_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#E5E9F0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Charges Breakdown", section_style))

    charge_rows = [["Description", "Details", Paragraph("<b>Amount</b>", right_style)]]
    if booking:
        charge_rows.append(
            [
                Paragraph("Base Transport / Trip Charge", muted_style),
                Paragraph(escape(booking.booking_type), muted_style),
                Paragraph(format_inr(booking.base_price), right_style),
            ]
        )
        if money(booking.additional_charges) > Decimal("0.00"):
            charge_rows.append(
                [
                    Paragraph("Additional Charges", muted_style),
                    Paragraph("Waiting / Extra Distance / Tolls", muted_style),
                    Paragraph(format_inr(booking.additional_charges), right_style),
                ]
            )
        if money(booking.discount_amount) > Decimal("0.00"):
            charge_rows.append(
                [
                    Paragraph("Discount", muted_style),
                    Paragraph("Authorized Deduction", muted_style),
                    Paragraph(f"- {format_inr(booking.discount_amount)}", right_style),
                ]
            )
    else:
        charge_rows.append(
            [
                Paragraph("Transport Service Charge", muted_style),
                Paragraph("Standard Charge", muted_style),
                Paragraph(format_inr(invoice.subtotal), right_style),
            ]
        )

    charge_rows.extend(
        [
            [Paragraph("Taxable Subtotal", muted_style), "", Paragraph(format_inr(invoice.subtotal), right_style)],
            [Paragraph("GST", muted_style), Paragraph(f"{money(invoice.gst_rate)}%", muted_style), Paragraph(format_inr(invoice.gst_amount), right_style)],
            [Paragraph("<b>Total Amount</b>", muted_style), "", Paragraph(f"<b>{format_inr(invoice.total_amount)}</b>", right_style)],
            [Paragraph("Net Paid Amount", muted_style), "", Paragraph(format_inr(invoice.paid_amount), right_style)],
            [Paragraph("<b>Balance Due</b>", muted_style), "", Paragraph(f"<b>{format_inr(invoice.balance_due)}</b>", right_style)],
        ]
    )

    charge_table = Table(charge_rows, colWidths=[210, 190, 120])
    charge_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#101722")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E9F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, -3), (-1, -3), colors.HexColor("#FFF7E8")),
            ]
        )
    )
    elements.append(charge_table)

    trn_payments = [p for p in (invoice.payments or []) if p.source_module == "TRANSPORT"]
    if trn_payments:
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("Payment History", section_style))
        pay_rows = [["Paid At", "Method", "Type", "Reference", Paragraph("<b>Amount</b>", right_style)]]
        for p in trn_payments:
            paid_at_str = p.paid_at.strftime("%d %b %Y %H:%M") if isinstance(p.paid_at, datetime) else "—"
            pay_rows.append(
                [
                    Paragraph(escape(paid_at_str), muted_style),
                    Paragraph(escape(getattr(p.payment_method, "value", str(p.payment_method))), muted_style),
                    Paragraph(escape(p.payment_type or "Full"), muted_style),
                    Paragraph(escape(p.reference_number or "—"), muted_style),
                    Paragraph(format_inr(p.amount), right_style),
                ]
            )
        pay_table = Table(pay_rows, colWidths=[110, 95, 75, 130, 110])
        pay_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E9F0")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        elements.append(pay_table)

    elements.append(Spacer(1, 18))
    elements.append(Paragraph(f"Thank you for riding with {escape(APP_NAME)} Transport.", center_muted))

    doc.build(elements)
    invoice.pdf_path = str(pdf_path.relative_to(BACKEND_ROOT)).replace("\\", "/")
    db.flush()
    return pdf_path
