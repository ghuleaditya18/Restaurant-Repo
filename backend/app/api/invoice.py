from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import IntegrityError

from app.core.date_utils import get_date_range
from app.db.session import get_db
from app.api.deps import require_roles, require_restaurant_context
from app.models.entities import (
    Order,
    OrderStatus,
    Invoice,
    Payment,
    PaymentStatus,
)

from fastapi.responses import FileResponse
from app.core.invoice_pdf import generate_invoice_pdf

from app.core.invoice_pdf import (
    generate_invoice_pdf,
    BACKEND_ROOT,
)

from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceResponse,
    InvoiceItemResponse,
)

router = APIRouter(
    tags=["Invoice Management"],
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)


# ==========================================
# COMMON FUNCTIONS
# ==========================================


def get_invoice_record(db: Session, invoice_id: int):

    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Invoice.order).joinedload(Order.table),
            joinedload(Invoice.order).selectinload(Order.items),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )

    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    return invoice


def build_invoice_response(invoice):

    order = invoice.order

    return InvoiceResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer.full_name,
        customer_phone=order.customer.phone,
        table_number=order.table.table_number,
        items=[
            InvoiceItemResponse(
                item_name=item.item_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in order.items
        ],
        subtotal=invoice.subtotal,
        gst_rate=invoice.gst_rate,
        gst_amount=invoice.gst_amount,
        total_amount=invoice.total_amount,
        payment_status=invoice.payment_status,
        pdf_path=invoice.pdf_path,
        created_at=invoice.created_at,
    )


# ==========================================
# 1. GENERATE INVOICE
# ==========================================


@router.post("/", response_model=InvoiceResponse, status_code=201)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
):

    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.table),
            selectinload(Order.items),
        )
        .filter(Order.id == data.order_id)
        .first()
    )

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order.status != OrderStatus.SERVED:
        raise HTTPException(
            status_code=400, detail="Invoice can only be generated for served orders."
        )

    existing_invoice = (
        db.query(Invoice).filter(Invoice.order_id == data.order_id).first()
    )

    if existing_invoice:
        raise HTTPException(
            status_code=409, detail="An invoice already exists for this order."
        )

    if not order.items:
        raise HTTPException(
            status_code=400, detail="Cannot generate an invoice for an empty order."
        )

    subtotal = sum((item.line_total for item in order.items), Decimal("0.00"))

    gst_amount = (subtotal * data.gst_rate / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    total_amount = subtotal + gst_amount

    invoice = Invoice(
        order_id=order.id,
        subtotal=subtotal,
        gst_rate=data.gst_rate,
        gst_amount=gst_amount,
        total_amount=total_amount,
        payment_status=PaymentStatus.PENDING,
    )

    try:

        db.add(invoice)
        db.commit()
        db.refresh(invoice)

        return build_invoice_response(get_invoice_record(db, invoice.id))

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409, detail="An invoice already exists for this order."
        )


# ==========================================
# 2. GET ALL INVOICES
# ==========================================


@router.get("/", response_model=list[InvoiceResponse])
def get_all_invoices(
    preset: str | None = "today",
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Invoice.order).joinedload(Order.table),
            joinedload(Invoice.order).selectinload(Order.items),
        )
    )

    start_dt, end_dt = get_date_range(preset, start_date, end_date)
    if start_dt is not None and end_dt is not None:
        query = query.filter(Invoice.created_at >= start_dt, Invoice.created_at <= end_dt)

    invoices = query.order_by(Invoice.id.desc()).all()

    return [build_invoice_response(invoice) for invoice in invoices]


# ==========================================
# 3. GET SINGLE INVOICE
# ==========================================


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):

    invoice = get_invoice_record(db, invoice_id)

    return build_invoice_response(invoice)


# ==========================================
# 4. GET INVOICE BY ORDER
# ==========================================


@router.get("/order/{order_id}", response_model=InvoiceResponse)
def get_invoice_by_order(
    order_id: int,
    db: Session = Depends(get_db),
):

    invoice = db.query(Invoice).filter(Invoice.order_id == order_id).first()

    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found for this order.")

    invoice = get_invoice_record(db, invoice.id)

    return build_invoice_response(invoice)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    payment_count = db.query(Payment.id).filter(Payment.invoice_id == invoice.id).count()
    if payment_count or invoice.payment_status != PaymentStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail="Invoices with recorded payments or a completed payment status cannot be deleted.",
        )

    invoice_number = invoice.invoice_number
    db.delete(invoice)
    db.commit()
    return {"message": f"Invoice {invoice_number} deleted successfully."}


# ==========================================
# 5. GENERATE / DOWNLOAD INVOICE PDF
# ==========================================


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
):

    invoice = get_invoice_record(db, invoice_id)

    try:

        pdf_path = generate_invoice_pdf(invoice)

        # Save the PDF location in the database.
        invoice.pdf_path = str(pdf_path.relative_to(BACKEND_ROOT)).replace("\\", "/")

        db.commit()

        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename=f"{invoice.invoice_number}.pdf",
        )

    except Exception:

        db.rollback()

        raise HTTPException(status_code=500, detail="Unable to generate invoice PDF.")
