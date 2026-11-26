"""Business services for the Activities Management module."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.core.branding import APP_NAME
from app.core.date_utils import get_kolkata_now
from app.models.activities import ActivityBooking, ActivityCategory
from app.models.entities import Customer, Invoice, Payment, PaymentMethod, PaymentStatus

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ACTIVITY_INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "activity-invoices"

ACTIVITY_CATEGORY_CONFIG = [
    {"name": ActivityCategory.WATER.value, "description": "Lagoon kayaking, pool sessions, and waterfront recreation."},
    {"name": ActivityCategory.ADVENTURE.value, "description": "Mountain trails, highland trekking, and guided expeditions."},
    {"name": ActivityCategory.INDOOR.value, "description": "Wellness studio yoga, table tennis, and indoor recreation."},
    {"name": ActivityCategory.OUTDOOR.value, "description": "Tennis courts, lawn sports, and open-air grounds."},
    {"name": ActivityCategory.TOUR.value, "description": "Curated resort tours, photography walks, and sightseeing."},
    {"name": ActivityCategory.NATURE.value, "description": "Botanical walks, birding, and eco-trails."},
    {"name": ActivityCategory.KIDS.value, "description": "Junior club sessions, crafts, and supervised games."},
    {"name": ActivityCategory.SPECIAL.value, "description": "Seasonal workshops, private events, and bespoke activities."},
]

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


def sync_activity_invoice_financials(db: Session, invoice: Invoice) -> Invoice:
    """Recompute paid_amount, balance_due, and payment_status from recorded PAID payments."""
    paid_sum = sum(
        (
            money(p.amount)
            for p in invoice.payments
            if p.source_module == "ACTIVITY" and p.status == PaymentStatus.PAID
        ),
        Decimal("0.00"),
    )
    paid_sum = money(paid_sum)
    total = money(invoice.total_amount)
    balance = money(max(Decimal("0.00"), total - paid_sum))

    invoice.paid_amount = paid_sum
    invoice.balance_due = balance
    if total == Decimal("0.00") or balance == Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PAID
    elif paid_sum > Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PARTIALLY_PAID
    else:
        invoice.payment_status = PaymentStatus.PENDING
    db.flush()
    return invoice


def generate_activity_invoice_pdf(
    db: Session,
    invoice: Invoice,
    booking: ActivityBooking | None = None,
    output_dir: Path | None = None,
) -> Path:
    """Generate and persist a clean formatted PDF invoice for an Activity booking."""
    target_dir = output_dir or ACTIVITY_INVOICE_PDF_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = target_dir / f"{invoice.invoice_number}.pdf"

    if booking is None and invoice.source_reference_id:
        booking = (
            db.query(ActivityBooking)
            .filter(ActivityBooking.id == invoice.source_reference_id)
            .first()
        )
    customer = invoice.customer or (
        db.get(Customer, invoice.customer_id) if invoice.customer_id else None
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ActInvTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        textColor=colors.HexColor("#172033"),
        spaceAfter=4,
    )
    muted_style = ParagraphStyle(
        "ActInvMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        leading=13,
    )
    section_style = ParagraphStyle(
        "ActInvSection",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#172033"),
        spaceBefore=8,
        spaceAfter=4,
    )
    right_style = ParagraphStyle(
        "ActInvRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#172033"),
    )
    center_muted = ParagraphStyle(
        "ActInvCenterMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748B"),
    )

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=32,
        bottomMargin=32,
    )

    elements: list = []
    elements.append(Paragraph(f"{escape(APP_NAME)} — Activities Tax Invoice", title_style))
    elements.append(
        Paragraph(
            f"Invoice #: <b>{escape(invoice.invoice_number)}</b> &nbsp;|&nbsp; "
            f"Booking #: <b>{escape(booking.booking_number if booking else (invoice.source_reference_number or 'N/A'))}</b> &nbsp;|&nbsp; "
            f"Status: <b>{escape(getattr(invoice.payment_status, 'value', str(invoice.payment_status)))}</b>",
            muted_style,
        )
    )
    elements.append(
        Paragraph(
            f"Issued (IST): {get_kolkata_now().strftime('%d %b %Y, %I:%M %p')}",
            muted_style,
        )
    )
    elements.append(Spacer(1, 8))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E5E9F0")))
    elements.append(Spacer(1, 10))

    cust_name = customer.full_name if customer else "Guest"
    cust_phone = customer.phone if customer else "—"
    cust_email = (customer.email if customer and customer.email else "—")

    act_name = booking.activity_name_snapshot if booking else "Activity Booking"
    bk_type = booking.booking_type_snapshot if booking else "—"
    bk_date = str(booking.booking_date) if booking else "—"
    participants = str(booking.participant_count) if booking else "1"

    meta_table = Table(
        [
            [
                Paragraph(
                    f"<b>Billed To</b><br/>{escape(cust_name)}<br/>Phone: {escape(cust_phone)}<br/>Email: {escape(cust_email)}",
                    muted_style,
                ),
                Paragraph(
                    f"<b>Activity Details</b><br/>Activity: {escape(act_name)}<br/>Type: {escape(bk_type)} &nbsp;|&nbsp; Date: {escape(bk_date)}<br/>Participants: {escape(participants)}",
                    muted_style,
                ),
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
    charge_rows = [
        ["Description", "Details", Paragraph("<b>Amount</b>", right_style)],
        [
            Paragraph(escape(act_name), muted_style),
            Paragraph(
                f"Pricing: {escape(booking.pricing_method if booking else 'per_person')} | Qty: {escape(participants)}",
                muted_style,
            ),
            Paragraph(format_inr(invoice.subtotal), right_style),
        ],
        [
            Paragraph("GST", muted_style),
            Paragraph(f"{money(invoice.gst_rate)}%", muted_style),
            Paragraph(format_inr(invoice.gst_amount), right_style),
        ],
        [
            Paragraph("<b>Total Amount</b>", muted_style),
            "",
            Paragraph(f"<b>{format_inr(invoice.total_amount)}</b>", right_style),
        ],
        [
            Paragraph("Paid Amount", muted_style),
            "",
            Paragraph(format_inr(invoice.paid_amount), right_style),
        ],
        [
            Paragraph("<b>Balance Due</b>", muted_style),
            "",
            Paragraph(f"<b>{format_inr(invoice.balance_due)}</b>", right_style),
        ],
    ]
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
                ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#FFF7E8")),
            ]
        )
    )
    elements.append(charge_table)

    act_payments = [p for p in (invoice.payments or []) if p.source_module == "ACTIVITY"]
    if act_payments:
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("Payment History", section_style))
        pay_rows = [["Paid At", "Method", "Type", "Reference", Paragraph("<b>Amount</b>", right_style)]]
        for p in act_payments:
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
    elements.append(
        Paragraph(
            f"Thank you for choosing {escape(APP_NAME)} Activities &amp; Recreation.",
            center_muted,
        )
    )

    doc.build(elements)

    try:
        invoice.pdf_path = str(pdf_path.relative_to(BACKEND_ROOT))
    except ValueError:
        invoice.pdf_path = str(pdf_path)
    db.flush()
    return pdf_path
