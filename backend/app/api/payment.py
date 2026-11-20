from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.core.date_utils import get_date_range, get_kolkata_now
from app.db.session import get_db
from app.api.deps import require_roles, require_restaurant_context

from app.models.entities import (
    Invoice,
    Payment,
    PaymentStatus,
)

from app.schemas.payment import (
    PaymentCreate,
    PaymentStatusUpdate,
    PaymentResponse,
)

router = APIRouter(
    tags=["Payment Management"],
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)


# ==========================================
# COMMON FUNCTION
# ==========================================


def get_payment_record(db: Session, payment_id: int):

    payment = (
        db.query(Payment)
        .options(joinedload(Payment.invoice))
        .filter(Payment.id == payment_id)
        .first()
    )

    if payment is None:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    return payment


# ==========================================
# 1. RECORD PAYMENT
# ==========================================


@router.post("/invoice/{invoice_id}", response_model=PaymentResponse, status_code=201)
def create_payment(
    invoice_id: int,
    data: PaymentCreate,
    db: Session = Depends(get_db),
):

    invoice = (
        db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    )

    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if invoice.payment_status == PaymentStatus.PAID:
        raise HTTPException(
            status_code=400, detail="This invoice has already been paid."
        )

    existing_payment = (
        db.query(Payment).filter(Payment.invoice_id == invoice_id).first()
    )

    if existing_payment:
        raise HTTPException(
            status_code=409, detail="A payment record already exists for this invoice."
        )

    payment = Payment(
        invoice_id=invoice.id,
        payment_method=data.payment_method,
        amount=invoice.total_amount,
        status=PaymentStatus.PENDING,
        reference_number=data.reference_number,
    )

    try:

        db.add(payment)
        db.commit()
        db.refresh(payment)

        return payment

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409, detail="Payment record could not be created."
        )


# ==========================================
# 2. GET ALL PAYMENTS
# ==========================================


@router.get("/", response_model=list[PaymentResponse])
def get_all_payments(
    preset: str | None = "today",
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Payment)

    start_dt, end_dt = get_date_range(preset, start_date, end_date)
    if start_dt is not None and end_dt is not None:
        query = query.filter(Payment.created_at >= start_dt, Payment.created_at <= end_dt)

    return query.order_by(Payment.id.desc()).all()


# ==========================================
# 3. GET SINGLE PAYMENT
# ==========================================


@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
):

    return get_payment_record(db, payment_id)


# ==========================================
# 4. UPDATE PAYMENT STATUS
# ==========================================


@router.patch("/{payment_id}/status", response_model=PaymentResponse)
def update_payment_status(
    payment_id: int,
    data: PaymentStatusUpdate,
    db: Session = Depends(get_db),
):

    payment = get_payment_record(db, payment_id)

    if payment.status == data.status:
        raise HTTPException(status_code=400, detail="Payment already has this status.")

    # Payment cannot be reversed from Paid to Pending.
    if payment.status == PaymentStatus.PAID:

        raise HTTPException(
            status_code=400, detail="A completed payment cannot be reverted."
        )

    # This initial implementation supports
    # Pending -> Paid only.

    if data.status != PaymentStatus.PAID:

        raise HTTPException(
            status_code=400, detail="Only Pending to Paid transition is supported."
        )

    payment.status = PaymentStatus.PAID

    payment.paid_at = get_kolkata_now()

    payment.invoice.payment_status = PaymentStatus.PAID

    try:

        db.commit()
        db.refresh(payment)

        return payment

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409, detail="Payment status update could not be completed."
        )
