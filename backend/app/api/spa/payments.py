from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.date_utils import get_date_range
from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import (
    SpaPayment,
    SpaInvoice,
    SpaCustomer,
)
from app.schemas.spa import (
    SpaPaymentCreate,
    SpaPaymentResponse,
)
from app.services.spa_service import record_spa_payment

router = APIRouter(dependencies=[Depends(require_spa_context)])


def build_payment_response(p: SpaPayment, db: Session) -> SpaPaymentResponse:
    rec_name = p.receiver.full_name if getattr(p, "receiver", None) else None
    if not rec_name and p.received_by:
        u = db.get(User, p.received_by)
        rec_name = u.full_name if u else None

    inv = p.invoice
    inv_num = inv.invoice_number if inv else None
    bkg_num = inv.booking.booking_number if inv and inv.booking else None
    cust_name = inv.customer.full_name if inv and inv.customer else None

    return SpaPaymentResponse(
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
        invoice_number=inv_num,
        booking_number=bkg_num,
        customer_name=cust_name,
    )


@router.get("/payments", response_model=list[SpaPaymentResponse])
def list_payments(
    preset: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    invoice_id: int | None = None,
    payment_method: str | None = None,
    payment_status: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = (
        db.query(SpaPayment)
        .options(
            joinedload(SpaPayment.invoice).joinedload(SpaInvoice.booking),
            joinedload(SpaPayment.invoice).joinedload(SpaInvoice.customer),
            joinedload(SpaPayment.receiver),
        )
    )

    if preset:
        start_dt, end_dt = get_date_range(preset, start_date, end_date)
        if start_dt is not None and end_dt is not None:
            query = query.filter(SpaPayment.paid_at >= start_dt, SpaPayment.paid_at <= end_dt)

    if invoice_id:
        query = query.filter(SpaPayment.invoice_id == invoice_id)

    if payment_method and payment_method.strip().lower() != "all":
        query = query.filter(func.lower(SpaPayment.payment_method) == payment_method.strip().lower())

    if payment_status and payment_status.strip().lower() != "all":
        query = query.filter(func.lower(SpaPayment.payment_status) == payment_status.strip().lower())

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.join(SpaInvoice, SpaPayment.invoice_id == SpaInvoice.id).join(
            SpaCustomer, SpaInvoice.customer_id == SpaCustomer.id
        ).filter(
            func.lower(SpaPayment.payment_reference).like(s)
            | func.lower(SpaInvoice.invoice_number).like(s)
            | func.lower(SpaCustomer.full_name).like(s)
            | func.lower(SpaPayment.transaction_reference).like(s)
        )

    payments = query.order_by(SpaPayment.paid_at.desc()).all()
    return [build_payment_response(p, db) for p in payments]


@router.post("/payments/{invoice_id}", response_model=SpaPaymentResponse, status_code=status.HTTP_201_CREATED)
def record_payment_for_invoice(
    invoice_id: int,
    payload: SpaPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    payment = record_spa_payment(
        db=db,
        invoice_id=invoice_id,
        payment_method=payload.payment_method,
        amount=payload.amount,
        transaction_reference=payload.transaction_reference,
        received_by_user_id=current_user.id,
    )
    return build_payment_response(payment, db)


@router.get("/payments/{payment_id}", response_model=SpaPaymentResponse)
def get_payment_detail(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    p = db.get(SpaPayment, payment_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return build_payment_response(p, db)
