from __future__ import annotations

from datetime import date, timedelta
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
from app.models.entities import Customer, Invoice, MenuItem, Payment, PaymentMethod, PaymentStatus
from app.models.packages import (
    Package,
    PackageBlackout,
    PackageBooking,
    PackageBookingHistory,
    PackageBookingItem,
    PackageBookingStatus,
    PackageCategory,
    PackageInclusionType,
    PackageItem,
    PackageMedia,
    PackagePricingType,
    PackageStatus,
)
from app.models.spa import SpaService
from app.models.villas import Unit

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "package-invoices"

PACKAGE_CATEGORY_CONFIG = [
    {"name": PackageCategory.COUPLE.value, "description": "Romantic getaways, honeymoons, and curated duo experiences."},
    {"name": PackageCategory.FAMILY.value, "description": "Multi-guest stays with family dining and resort activities."},
    {"name": PackageCategory.WEEKEND.value, "description": "Short 1–3 night rejuvenating weekend escapes."},
    {"name": PackageCategory.WELLNESS.value, "description": "Spa, mindfulness, and holistic wellness retreats."},
    {"name": PackageCategory.ADVENTURE.value, "description": "Outdoor trails, nature excursions, and guided adventures."},
    {"name": PackageCategory.EVENT.value, "description": "Celebrations, milestone gatherings, and special occasions."},
    {"name": PackageCategory.SEASONAL.value, "description": "Limited-time festive, monsoon, summer, and holiday offers."},
]

ALLOWED_PACKAGE_BOOKING_TRANSITIONS: dict[str, set[str]] = {
    PackageBookingStatus.PENDING.value: {
        PackageBookingStatus.CONFIRMED.value,
        PackageBookingStatus.CANCELLED.value,
    },
    PackageBookingStatus.CONFIRMED.value: {
        PackageBookingStatus.IN_PROGRESS.value,
        PackageBookingStatus.CANCELLED.value,
    },
    PackageBookingStatus.IN_PROGRESS.value: {
        PackageBookingStatus.COMPLETED.value,
        PackageBookingStatus.CANCELLED.value,
    },
    PackageBookingStatus.COMPLETED.value: set(),
    PackageBookingStatus.CANCELLED.value: set(),
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


def calculate_package_price(
    *,
    pricing_type: str,
    unit_price: Decimal,
    guest_count: int,
    duration_nights: int,
) -> Decimal:
    base = money(unit_price)
    if pricing_type == PackagePricingType.PER_PACKAGE.value:
        return base
    if pricing_type == PackagePricingType.PER_PERSON.value:
        return money(base * Decimal(int(guest_count)))
    if pricing_type == PackagePricingType.PER_NIGHT.value:
        return money(base * Decimal(int(duration_nights)))
    raise HTTPException(status_code=422, detail=f"Unsupported pricing type '{pricing_type}'.")


def sync_expired_packages(db: Session) -> int:
    """Automatically marks Active or Inactive packages past valid_to as Expired."""
    today = get_kolkata_today()
    expired_rows = (
        db.query(Package)
        .filter(
            Package.is_deleted.is_(False),
            Package.status.in_([PackageStatus.ACTIVE.value, PackageStatus.INACTIVE.value]),
            Package.valid_to < today,
        )
        .all()
    )
    if not expired_rows:
        return 0
    for pkg in expired_rows:
        pkg.status = PackageStatus.EXPIRED.value
    db.commit()
    return len(expired_rows)


def validate_package_for_activation(pkg: Package) -> list[str]:
    """Returns a list of validation errors preventing activation."""
    errors: list[str] = []
    today = get_kolkata_today()

    if not pkg.name or len(pkg.name.strip()) < 2:
        errors.append("Package name is required.")
    if not pkg.package_code or len(pkg.package_code.strip()) < 2:
        errors.append("Unique package code is required.")
    if not pkg.category:
        errors.append("Package category is required.")
    if pkg.duration_nights is None or pkg.duration_nights < 1:
        errors.append("Duration in nights must be at least 1.")
    if pkg.min_guests is None or pkg.min_guests < 1:
        errors.append("Minimum guests must be at least 1.")
    if pkg.max_guests is None or pkg.max_guests < (pkg.min_guests or 1):
        errors.append("Maximum guests cannot be lower than minimum guests.")
    if pkg.price is None or money(pkg.price) <= Decimal("0.00"):
        errors.append("Package price must be greater than zero.")
    if not pkg.valid_from or not pkg.valid_to:
        errors.append("Validity start and end dates are required.")
    else:
        if pkg.valid_to < pkg.valid_from:
            errors.append("Valid-to date cannot precede valid-from date.")
        if pkg.valid_to < today:
            errors.append("Valid-to date has already passed; extend validity before activating.")
    if not pkg.items or len(pkg.items) == 0:
        errors.append("At least one valid package inclusion is required before activation.")
    return errors


def find_overlapping_blackouts(
    pkg: Package,
    start_date: date,
    duration_nights: int | None = None,
) -> list[PackageBlackout]:
    nights = max(1, int(duration_nights or pkg.duration_nights or 1))
    stay_last_night = start_date + timedelta(days=nights - 1)
    conflicts: list[PackageBlackout] = []
    for b in pkg.blackouts:
        if not b.is_active:
            continue
        if start_date <= b.end_date and stay_last_night >= b.start_date:
            conflicts.append(b)
    return conflicts


def evaluate_package_availability(
    db: Session,
    pkg: Package,
    start_date: date,
    guest_count: int,
) -> dict:
    today = get_kolkata_today()
    reasons: list[str] = []

    if pkg.is_deleted:
        reasons.append("Package has been deleted.")
    elif pkg.status == PackageStatus.EXPIRED.value or pkg.valid_to < today:
        if pkg.status in {PackageStatus.ACTIVE.value, PackageStatus.INACTIVE.value} and pkg.valid_to < today:
            pkg.status = PackageStatus.EXPIRED.value
            db.commit()
        reasons.append("Package validity has expired and cannot be booked.")
    elif pkg.status != PackageStatus.ACTIVE.value:
        reasons.append(f"Package is currently '{pkg.status}' and must be Active to book.")

    if start_date < today:
        reasons.append("Booking start date cannot be in the past.")
    if start_date < pkg.valid_from or start_date > pkg.valid_to:
        reasons.append(
            f"Start date {start_date.isoformat()} falls outside package validity ({pkg.valid_from.isoformat()} to {pkg.valid_to.isoformat()})."
        )

    if guest_count < pkg.min_guests or guest_count > pkg.max_guests:
        reasons.append(
            f"Guest count must be between {pkg.min_guests} and {pkg.max_guests} guests."
        )

    blackout_conflicts = find_overlapping_blackouts(pkg, start_date, pkg.duration_nights)
    for blk in blackout_conflicts:
        reasons.append(
            f"Blackout date conflict ({blk.start_date.isoformat()} to {blk.end_date.isoformat()}): {blk.reason}."
        )

    if not pkg.items:
        reasons.append("Package has no configured inclusions.")

    end_date = start_date + timedelta(days=max(1, pkg.duration_nights))
    calculated_total = calculate_package_price(
        pricing_type=pkg.pricing_type,
        unit_price=pkg.price,
        guest_count=guest_count,
        duration_nights=pkg.duration_nights,
    )

    return {
        "available": len(reasons) == 0,
        "reasons": reasons,
        "package_id": pkg.id,
        "package_code": pkg.package_code,
        "package_name": pkg.name,
        "status": pkg.status,
        "start_date": start_date,
        "end_date": end_date,
        "duration_nights": pkg.duration_nights,
        "guest_count": guest_count,
        "pricing_type": pkg.pricing_type,
        "unit_price": money(pkg.price),
        "calculated_total": calculated_total,
        "blackout_conflicts": [
            {
                "id": blk.id,
                "start_date": blk.start_date,
                "end_date": blk.end_date,
                "reason": blk.reason,
            }
            for blk in blackout_conflicts
        ],
    }


def generate_package_booking_number(db: Session) -> str:
    year = get_kolkata_today().year
    prefix = f"PKG-{year}-"
    existing_numbers = (
        db.query(PackageBooking.booking_number)
        .filter(PackageBooking.booking_number.like(f"{prefix}%"))
        .all()
    )
    max_seq = 0
    for (num,) in existing_numbers:
        suffix = num[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:04d}"


def record_package_booking_history(
    db: Session,
    *,
    booking_id: int,
    action: str,
    previous_status: str | None,
    new_status: str,
    changed_by: int | None,
    reason: str | None = None,
) -> PackageBookingHistory:
    entry = PackageBookingHistory(
        booking_id=booking_id,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason.strip() if reason else None,
        changed_by=changed_by,
    )
    db.add(entry)
    return entry


def get_supported_inclusion_references(db: Session) -> dict[str, list[dict]]:
    """
    Safely reads available catalog options from existing completed modules (Villas, Spa, Restaurant)
    without writing to or coupling tightly with their operational booking tables.
    """
    refs: dict[str, list[dict]] = {
        "Unit Stay": [],
        "Spa Service": [],
        "Meal Plan": [],
        "Activity": [],
        "Transport Service": [],
        "Amenity": [],
        "Other": [],
    }

    try:
        units = db.query(Unit).filter(Unit.is_active.is_(True)).order_by(Unit.name.asc()).limit(100).all()
        refs["Unit Stay"] = [
            {
                "reference_module": "VILLA",
                "reference_id": u.id,
                "label": f"{u.name} ({u.villa.name if u.villa else 'Villa'})",
                "meta": f"Capacity {u.capacity} · INR {money(u.base_rate)}/night",
            }
            for u in units
        ]
    except Exception:
        refs["Unit Stay"] = []

    try:
        services = db.query(SpaService).filter(SpaService.is_available.is_(True)).order_by(SpaService.name.asc()).limit(100).all()
        refs["Spa Service"] = [
            {
                "reference_module": "SPA",
                "reference_id": s.id,
                "label": s.name,
                "meta": f"{s.duration_minutes} mins · INR {money(s.price)}",
            }
            for s in services
        ]
    except Exception:
        refs["Spa Service"] = []

    try:
        menu_items = db.query(MenuItem).filter(MenuItem.is_available.is_(True)).order_by(MenuItem.name.asc()).limit(100).all()
        refs["Meal Plan"] = [
            {
                "reference_module": "RESTAURANT",
                "reference_id": m.id,
                "label": m.name,
                "meta": f"INR {money(m.price)}",
            }
            for m in menu_items
        ]
    except Exception:
        refs["Meal Plan"] = []

    return refs


def validate_inclusion_reference(
    db: Session,
    inclusion_type: str,
    reference_id: int | None,
    reference_module: str | None,
    reference_label: str | None,
) -> tuple[str | None, int | None, str | None]:
    if reference_id is None:
        return reference_module, None, reference_label

    if inclusion_type == PackageInclusionType.UNIT_STAY.value:
        unit = db.get(Unit, reference_id)
        if not unit:
            raise HTTPException(status_code=404, detail=f"Referenced Villa Unit #{reference_id} not found.")
        return "VILLA", unit.id, reference_label or f"{unit.name} ({unit.villa.name if unit.villa else 'Villa'})"

    if inclusion_type == PackageInclusionType.SPA_SERVICE.value:
        svc = db.get(SpaService, reference_id)
        if not svc:
            raise HTTPException(status_code=404, detail=f"Referenced Spa Service #{reference_id} not found.")
        return "SPA", svc.id, reference_label or svc.name

    if inclusion_type == PackageInclusionType.MEAL_PLAN.value:
        item = db.get(MenuItem, reference_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Referenced Meal/Menu Item #{reference_id} not found.")
        return "RESTAURANT", item.id, reference_label or item.name

    # Pending modules (Activity, Transport Service, Amenity, Other): preserve reference cleanly without fake coupling
    default_module = {
        PackageInclusionType.ACTIVITY.value: "ACTIVITY",
        PackageInclusionType.TRANSPORT_SERVICE.value: "TRANSPORT",
    }.get(inclusion_type, reference_module)
    return reference_module or default_module, reference_id, reference_label


def create_package_invoice_for_booking(
    db: Session,
    *,
    booking: PackageBooking,
    gst_rate: Decimal = Decimal("18.00"),
    notes: str | None = None,
    changed_by: int | None = None,
) -> Invoice:
    if booking.status == PackageBookingStatus.CANCELLED.value:
        raise HTTPException(status_code=409, detail="Cannot generate an invoice for a cancelled package booking.")

    existing = (
        db.query(Invoice)
        .filter(Invoice.package_booking_id == booking.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="An invoice already exists for this package booking.")

    subtotal = money(booking.total_amount)
    rate = money(gst_rate)
    gst_amount = money(subtotal * rate / Decimal("100"))
    total_amount = money(subtotal + gst_amount)

    invoice = Invoice(
        invoice_number=f"PKG-INV-{uuid4().hex[:8].upper()}",
        order_id=None,
        source_module="PACKAGE",
        source_reference_id=booking.id,
        source_reference_number=booking.booking_number,
        package_booking_id=booking.id,
        customer_id=booking.customer_id,
        subtotal=subtotal,
        gst_rate=rate,
        gst_amount=gst_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        balance_due=total_amount,
        payment_status=PaymentStatus.PENDING,
        notes=notes.strip() if notes else None,
    )
    db.add(invoice)
    db.flush()

    record_package_booking_history(
        db,
        booking_id=booking.id,
        action="INVOICE_CREATED",
        previous_status=booking.status,
        new_status=booking.status,
        changed_by=changed_by,
        reason=f"Invoice {invoice.invoice_number} created (Total INR {total_amount})",
    )
    return invoice


def sync_package_invoice_financials(db: Session, invoice: Invoice) -> Invoice:
    paid_sum = money(
        db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .filter(
            Payment.invoice_id == invoice.id,
            Payment.source_module == "PACKAGE",
            Payment.status == PaymentStatus.PAID,
        )
        .scalar()
    )
    total = money(invoice.total_amount)
    balance = max(Decimal("0.00"), money(total - paid_sum))
    invoice.paid_amount = paid_sum
    invoice.balance_due = balance
    if paid_sum <= Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PENDING
    elif balance <= Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PAID
    else:
        invoice.payment_status = PaymentStatus.PARTIALLY_PAID
    return invoice


def record_package_payment(
    db: Session,
    *,
    invoice_id: int,
    amount: Decimal,
    payment_method: str,
    payment_type: str,
    reference_number: str | None,
    received_by_user_id: int | None,
) -> tuple[Invoice, Payment]:
    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id, Invoice.source_module == "PACKAGE")
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Package invoice not found.")

    booking = db.get(PackageBooking, invoice.package_booking_id) if invoice.package_booking_id else None
    if booking and booking.status == PackageBookingStatus.CANCELLED.value:
        raise HTTPException(status_code=409, detail="Cannot record payment on a cancelled package booking.")

    sync_package_invoice_financials(db, invoice)
    if invoice.payment_status == PaymentStatus.PAID or money(invoice.balance_due) <= Decimal("0.00"):
        raise HTTPException(status_code=409, detail="This package invoice is already fully paid.")

    pay_amount = money(amount)
    if pay_amount <= Decimal("0.00"):
        raise HTTPException(status_code=422, detail="Payment amount must be greater than zero.")
    if pay_amount > money(invoice.balance_due):
        raise HTTPException(
            status_code=422,
            detail=f"Payment amount (INR {pay_amount}) exceeds remaining balance due (INR {money(invoice.balance_due)}).",
        )

    method_enum = PAYMENT_METHOD_ENUM_MAP.get(payment_method)
    if not method_enum:
        raise HTTPException(status_code=422, detail=f"Unsupported payment method '{payment_method}'.")

    payment = Payment(
        invoice_id=invoice.id,
        payment_method=method_enum,
        amount=pay_amount,
        status=PaymentStatus.PAID,
        reference_number=reference_number,
        paid_at=get_kolkata_now(),
        source_module="PACKAGE",
        payment_type=payment_type,
        received_by=received_by_user_id,
    )
    db.add(payment)
    db.flush()

    sync_package_invoice_financials(db, invoice)

    if booking:
        record_package_booking_history(
            db,
            booking_id=booking.id,
            action="PAYMENT_RECORDED",
            previous_status=booking.status,
            new_status=booking.status,
            changed_by=received_by_user_id,
            reason=f"{payment_type} payment of INR {pay_amount} via {payment_method} recorded on {invoice.invoice_number}",
        )

    db.commit()
    db.refresh(invoice)
    db.refresh(payment)
    return invoice, payment


def generate_package_invoice_pdf(db: Session, invoice: Invoice) -> Path:
    PACKAGE_INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)
    booking = db.get(PackageBooking, invoice.package_booking_id) if invoice.package_booking_id else None
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else (booking.customer if booking else None)

    filename = f"package-invoice-{invoice.id}-{invoice.invoice_number}.pdf"
    pdf_path = PACKAGE_INVOICE_PDF_DIR / filename

    document = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=35,
        leftMargin=35,
        topMargin=35,
        bottomMargin=35,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PkgInvoiceTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=colors.HexColor("#172033"),
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    heading_style = ParagraphStyle(
        "PkgInvoiceHeading",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=colors.HexColor("#D97706"),
        spaceAfter=6,
    )
    normal_style = ParagraphStyle(
        "PkgInvoiceNormal",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#172033"),
    )
    small_style = ParagraphStyle(
        "PkgInvoiceSmall",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748B"),
    )
    right_style = ParagraphStyle("PkgInvoiceRight", parent=normal_style, alignment=TA_RIGHT)

    story = []
    story.append(Paragraph(f"{APP_NAME} · PACKAGES", title_style))
    story.append(
        Paragraph(
            "Curated Resort Packages &amp; Experiences Billing",
            ParagraphStyle("PkgSub", parent=normal_style, alignment=TA_CENTER),
        )
    )
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#F59E0B")))
    story.append(Spacer(1, 16))
    story.append(Paragraph("TAX INVOICE", heading_style))

    created_str = invoice.created_at.strftime("%d %b %Y, %I:%M %p") if invoice.created_at else "—"
    booking_num = booking.booking_number if booking else (invoice.source_reference_number or "—")
    pkg_label = (
        f"{booking.package_name_snapshot} ({booking.package_code_snapshot})"
        if booking
        else "Resort Package"
    )
    dates_label = (
        f"{booking.start_date.strftime('%d %b %Y')} to {booking.end_date.strftime('%d %b %Y')} "
        f"({booking.duration_nights_snapshot} night{'s' if booking.duration_nights_snapshot != 1 else ''}, {booking.guest_count} guests)"
        if booking
        else "—"
    )

    info_table = Table(
        [
            [
                Paragraph(f"<b>Invoice Number:</b><br/>{escape(invoice.invoice_number)}", normal_style),
                Paragraph(f"<b>Booking Reference:</b><br/>{escape(booking_num)} (Source: {escape(invoice.source_module)})", normal_style),
            ],
            [
                Paragraph(f"<b>Invoice Date:</b><br/>{escape(created_str)}", normal_style),
                Paragraph(f"<b>Package &amp; Dates:</b><br/>{escape(pkg_label)}<br/>{escape(dates_label)}", normal_style),
            ],
        ],
        colWidths=[250, 270],
    )
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E9F0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E9F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 14))

    story.append(Paragraph("BILL TO", heading_style))
    if customer:
        story.append(Paragraph(f"<b>{escape(customer.full_name)}</b>", normal_style))
        story.append(Paragraph(f"Phone: {escape(customer.phone)}", normal_style))
        if customer.email:
            story.append(Paragraph(f"Email: {escape(customer.email)}", normal_style))
        if customer.address:
            story.append(Paragraph(f"Address: {escape(customer.address)}", normal_style))
    story.append(Spacer(1, 16))

    story.append(Paragraph("PACKAGE CHARGES &amp; INCLUDED SERVICES", heading_style))
    rows = [["Description", "Pricing / Qty", "Billing Source", "Amount"]]
    if booking:
        rows.append(
            [
                Paragraph(
                    f"<b>{escape(booking.package_name_snapshot)}</b> ({escape(booking.package_category_snapshot)})",
                    normal_style,
                ),
                f"{booking.pricing_type_snapshot} · {booking.guest_count}G / {booking.duration_nights_snapshot}N",
                booking.source_identifier,
                format_inr(invoice.subtotal),
            ]
        )
        for item in booking.items:
            if not item.is_selected:
                continue
            opt_tag = " (Optional)" if item.is_optional else ""
            rows.append(
                [
                    Paragraph(f"• [{escape(item.inclusion_type)}] {escape(item.description)}{opt_tag}", small_style),
                    f"Qty {item.quantity}",
                    "Included (PACKAGE)",
                    "Included",
                ]
            )

    items_table = Table(rows, colWidths=[230, 110, 95, 85], repeatRows=1)
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#101722")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E9F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (3, 1), (3, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 16))

    summary_rows = [
        ["Package Subtotal", format_inr(invoice.subtotal)],
        [f"GST ({invoice.gst_rate}%)", format_inr(invoice.gst_amount)],
        ["Grand Total", format_inr(invoice.total_amount)],
        ["Paid Amount", format_inr(invoice.paid_amount)],
        ["Balance Due", format_inr(invoice.balance_due)],
    ]
    summary_table = Table(summary_rows, colWidths=[170, 150], hAlign="RIGHT")
    summary_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEABOVE", (0, 2), (-1, 2), 0.8, colors.HexColor("#F59E0B")),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#FFF7E8")),
                ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 16))

    pay_status = getattr(invoice.payment_status, "value", str(invoice.payment_status))
    story.append(Paragraph(f"<b>Payment Status:</b> {escape(pay_status)}", normal_style))
    if invoice.payments:
        story.append(Spacer(1, 8))
        story.append(Paragraph("PAYMENT HISTORY", heading_style))
        for p in invoice.payments:
            if p.source_module != "PACKAGE":
                continue
            method_str = getattr(p.payment_method, "value", str(p.payment_method))
            paid_dt = p.paid_at.strftime("%d %b %Y, %I:%M %p") if p.paid_at else "—"
            ref_str = f" · Ref: {escape(p.reference_number)}" if p.reference_number else ""
            story.append(
                Paragraph(
                    f"• {escape(p.payment_type)} · {escape(method_str)} · {format_inr(p.amount)} · {paid_dt}{ref_str}",
                    small_style,
                )
            )

    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#E5E9F0")))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"Thank you for choosing {APP_NAME} Packages!",
            ParagraphStyle("PkgFooter", parent=normal_style, alignment=TA_CENTER, textColor=colors.HexColor("#D97706")),
        )
    )
    story.append(
        Paragraph(
            "Package inclusions marked 'Included (PACKAGE)' are covered by this package billing and should not be double-billed.",
            ParagraphStyle("PkgFooterNote", parent=small_style, alignment=TA_CENTER),
        )
    )

    document.build(story)
    invoice.pdf_path = str(pdf_path.relative_to(BACKEND_ROOT)).replace("\\", "/")
    db.commit()
    return pdf_path
