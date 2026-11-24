import os
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.date_utils import get_date_range
from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import (
    SpaInvoice,
    SpaInvoiceItem,
    SpaPayment,
    SpaBooking,
    SpaCustomer,
)
from app.schemas.spa import (
    SpaInvoiceCreate,
    SpaInvoiceResponse,
    SpaInvoiceItemResponse,
    SpaPaymentResponse,
)
from app.services.spa_service import generate_spa_invoice

router = APIRouter(dependencies=[Depends(require_spa_context)])


def build_invoice_response(inv: SpaInvoice, db: Session) -> SpaInvoiceResponse:
    items = [
        SpaInvoiceItemResponse(
            id=it.id,
            service_name=it.service_name,
            quantity=it.quantity,
            unit_price=it.unit_price,
            tax_rate=it.tax_rate,
            tax_amount=it.tax_amount,
            subtotal=it.subtotal,
            total_amount=it.total_amount,
            duration_minutes=it.booking_service.duration_minutes if it.booking_service else None,
        )
        for it in inv.items
    ]

    booking_num = inv.booking.booking_number if inv.booking else ""
    cust_name = inv.customer.full_name if inv.customer else "Customer"

    payments = []
    for p in inv.payments:
        rec_name = None
        if p.received_by:
            u = db.get(User, p.received_by)
            rec_name = u.full_name if u else None
        payments.append(
            SpaPaymentResponse(
                id=p.id,
                invoice_id=p.invoice_id,
                payment_reference=p.payment_reference,
                payment_method=p.payment_method,
                amount=p.amount,
                payment_status=p.payment_status,
                transaction_reference=p.transaction_reference,
                received_by=p.received_by,
                receiver_name=rec_name,
                paid_at=p.paid_at,
                invoice_number=inv.invoice_number,
                booking_number=booking_num,
                customer_name=cust_name,
            )
        )

    return SpaInvoiceResponse(
        id=inv.id,
        invoice_number=inv.invoice_number,
        booking_id=inv.booking_id,
        booking_number=booking_num,
        customer_id=inv.customer_id,
        customer_name=cust_name,
        customer_phone=inv.customer.phone if inv.customer else "",
        customer_email=inv.customer.email if inv.customer else None,
        subtotal=inv.subtotal,
        tax_rate=inv.tax_rate,
        tax_amount=inv.tax_amount,
        discount_amount=inv.discount_amount,
        total_amount=inv.total_amount,
        paid_amount=inv.paid_amount,
        balance_due=inv.balance_due,
        payment_status=inv.payment_status,
        pdf_path=inv.pdf_path,
        created_at=inv.created_at,
        items=items,
        payments=payments,
    )


@router.get("/invoices", response_model=list[SpaInvoiceResponse])
def list_invoices(
    preset: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    payment_status: str | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = (
        db.query(SpaInvoice)
        .options(
            joinedload(SpaInvoice.customer),
            joinedload(SpaInvoice.booking),
            joinedload(SpaInvoice.items).joinedload(SpaInvoiceItem.booking_service),
            joinedload(SpaInvoice.payments),
        )
    )

    if preset:
        start_dt, end_dt = get_date_range(preset, start_date, end_date)
        if start_dt is not None and end_dt is not None:
            query = query.filter(SpaInvoice.created_at >= start_dt, SpaInvoice.created_at <= end_dt)

    if payment_status and payment_status.strip().lower() != "all":
        query = query.filter(func.lower(SpaInvoice.payment_status) == payment_status.strip().lower())

    if customer_id:
        query = query.filter(SpaInvoice.customer_id == customer_id)

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.join(SpaCustomer, SpaInvoice.customer_id == SpaCustomer.id).filter(
            func.lower(SpaInvoice.invoice_number).like(s)
            | func.lower(SpaCustomer.full_name).like(s)
            | SpaCustomer.phone.like(s)
        )

    invoices = query.order_by(SpaInvoice.created_at.desc()).all()
    return [build_invoice_response(inv, db) for inv in invoices]


@router.post("/invoices", response_model=SpaInvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: SpaInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    inv = generate_spa_invoice(
        db=db,
        booking_id=payload.booking_id,
        tax_rate=payload.tax_rate,
        discount_amount=payload.discount_amount,
    )
    return build_invoice_response(inv, db)


@router.get("/invoices/{invoice_id}", response_model=SpaInvoiceResponse)
def get_invoice_detail(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    inv = (
        db.query(SpaInvoice)
        .options(
            joinedload(SpaInvoice.customer),
            joinedload(SpaInvoice.booking),
            joinedload(SpaInvoice.items).joinedload(SpaInvoiceItem.booking_service),
            joinedload(SpaInvoice.payments),
        )
        .filter(SpaInvoice.id == invoice_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return build_invoice_response(inv, db)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    inv = db.query(SpaInvoice).filter(SpaInvoice.id == invoice_id).with_for_update().first()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")

    payment_count = db.query(SpaPayment.id).filter(SpaPayment.invoice_id == inv.id).count()
    if payment_count or Decimal(str(inv.paid_amount or 0)) > 0 or str(inv.payment_status).strip().lower() != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoices with recorded payments or a completed payment status cannot be deleted.",
        )

    invoice_number = inv.invoice_number
    db.delete(inv)
    db.commit()
    return {"message": f"Invoice {invoice_number} deleted successfully."}


@router.get("/invoices/{invoice_id}/download")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    inv = db.get(SpaInvoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")

    if not inv.pdf_path or not os.path.exists(inv.pdf_path):
        from app.services.spa_service import generate_spa_invoice_pdf
        pdf_path = generate_spa_invoice_pdf(inv)
        inv.pdf_path = pdf_path
        db.commit()

    return FileResponse(
        path=inv.pdf_path,
        media_type="application/pdf",
        filename=f"Spa-Invoice-{inv.invoice_number}.pdf",
    )
