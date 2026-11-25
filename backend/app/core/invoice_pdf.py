from pathlib import Path
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import (
    getSampleStyleSheet,
    ParagraphStyle,
)
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from app.core.branding import APP_NAME

# ==========================================
# DIRECTORY CONFIGURATION
# ==========================================

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Private folder: invoices are not exposed through
# the public /uploads static-file directory.
INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "invoices"

INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)


# ==========================================
# CURRENCY FORMAT
# ==========================================


def format_amount(value):

    return f"INR {Decimal(str(value or 0)):,.2f}"


# ==========================================
# GENERATE INVOICE PDF
# ==========================================


def generate_invoice_pdf(invoice):

    order = invoice.order
    customer = order.customer
    table = order.table

    filename = f"invoice-{invoice.id}-{invoice.invoice_number}.pdf"

    pdf_path = INVOICE_PDF_DIR / filename

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
        "InvoiceTitle",
        parent=styles["Title"],
        fontSize=23,
        textColor=colors.HexColor("#29231F"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )

    heading_style = ParagraphStyle(
        "InvoiceHeading",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#C65D35"),
        spaceAfter=8,
    )

    normal_style = ParagraphStyle(
        "InvoiceNormal",
        parent=styles["Normal"],
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#29231F"),
    )

    small_style = ParagraphStyle(
        "InvoiceSmall",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#6B625B"),
    )

    right_style = ParagraphStyle(
        "InvoiceRight",
        parent=normal_style,
        alignment=TA_RIGHT,
    )

    story = []

    # ======================================
    # HEADER
    # ======================================

    story.append(Paragraph(f"{APP_NAME} RESTAURANT", title_style))

    story.append(
        Paragraph(
            "Restaurant Management System",
            ParagraphStyle(
                "Subtitle",
                parent=normal_style,
                alignment=TA_CENTER,
            ),
        )
    )

    story.append(Spacer(1, 10))

    story.append(
        HRFlowable(
            width="100%",
            thickness=1,
            color=colors.HexColor("#C65D35"),
        )
    )

    story.append(Spacer(1, 18))

    story.append(Paragraph("TAX INVOICE", heading_style))

    # ======================================
    # INVOICE INFORMATION
    # ======================================

    created_at = (
        invoice.created_at.strftime("%d %B %Y, %I:%M %p") if invoice.created_at else "—"
    )

    invoice_data = [
        [
            Paragraph(
                f"<b>Invoice Number:</b><br/>" f"{escape(invoice.invoice_number)}",
                normal_style,
            ),
            Paragraph(
                f"<b>Order Number:</b><br/>" f"{escape(order.order_number)}",
                normal_style,
            ),
        ],
        [
            Paragraph(
                f"<b>Invoice Date:</b><br/>{created_at}",
                normal_style,
            ),
            Paragraph(
                f"<b>Table:</b><br/>" f"Table {escape(str(table.table_number))}",
                normal_style,
            ),
        ],
    ]

    info_table = Table(
        invoice_data,
        colWidths=[260, 260],
    )

    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F5F0")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9E3DA")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E9E3DA")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )

    story.append(info_table)
    story.append(Spacer(1, 18))

    # ======================================
    # CUSTOMER INFORMATION
    # ======================================

    story.append(Paragraph("BILL TO", heading_style))

    customer_lines = [
        f"<b>{escape(customer.full_name)}</b>",
        f"Phone: {escape(customer.phone)}",
    ]

    if customer.email:
        customer_lines.append(f"Email: {escape(customer.email)}")

    if customer.address:
        customer_lines.append(f"Address: {escape(customer.address)}")

    for line in customer_lines:
        story.append(Paragraph(line, normal_style))

    story.append(Spacer(1, 20))

    # ======================================
    # ORDER ITEMS
    # ======================================

    story.append(Paragraph("ORDER DETAILS", heading_style))

    item_rows = [
        [
            "Item Description",
            "Qty",
            "Unit Price",
            "Total",
        ]
    ]

    for item in order.items:

        item_rows.append(
            [
                Paragraph(
                    escape(item.item_name),
                    normal_style,
                ),
                str(item.quantity),
                format_amount(item.unit_price),
                format_amount(item.line_total),
            ]
        )

    item_table = Table(
        item_rows,
        colWidths=[230, 45, 115, 130],
        repeatRows=1,
    )

    item_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#29231F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E9E3DA")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [
                        colors.white,
                        colors.HexColor("#FAF9F6"),
                    ],
                ),
            ]
        )
    )

    story.append(item_table)
    story.append(Spacer(1, 20))

    # ======================================
    # AMOUNT SUMMARY
    # ======================================

    amount_rows = [
        ["Subtotal", format_amount(invoice.subtotal)],
        [
            f"GST ({invoice.gst_rate}%)",
            format_amount(invoice.gst_amount),
        ],
        [
            "GRAND TOTAL",
            format_amount(invoice.total_amount),
        ],
    ]

    amount_table = Table(
        amount_rows,
        colWidths=[160, 160],
        hAlign="RIGHT",
    )

    amount_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#C65D35")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F7F5F0")),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#C65D35")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )

    story.append(amount_table)
    story.append(Spacer(1, 18))

    # ======================================
    # PAYMENT STATUS
    # ======================================

    story.append(
        Paragraph(
            f"<b>Payment Status:</b> " f"{escape(invoice.payment_status.value)}",
            normal_style,
        )
    )

    story.append(Spacer(1, 30))

    # ======================================
    # FOOTER
    # ======================================

    story.append(
        HRFlowable(
            width="100%",
            thickness=0.7,
            color=colors.HexColor("#E9E3DA"),
        )
    )

    story.append(Spacer(1, 10))

    story.append(
        Paragraph(
            "Thank you for dining with us!",
            ParagraphStyle(
                "Footer",
                parent=normal_style,
                alignment=TA_CENTER,
                textColor=colors.HexColor("#C65D35"),
            ),
        )
    )

    story.append(
        Paragraph(
            "This is a computer-generated invoice.",
            ParagraphStyle(
                "FooterSmall",
                parent=small_style,
                alignment=TA_CENTER,
            ),
        )
    )

    # ======================================
    # BUILD PDF
    # ======================================

    document.build(story)

    return pdf_path
