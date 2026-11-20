from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import SpaCustomer, SpaBooking
from app.schemas.spa import (
    SpaCustomerCreate,
    SpaCustomerUpdate,
    SpaCustomerResponse,
    SpaBookingResponse,
)

router = APIRouter(dependencies=[Depends(require_spa_context)])


@router.get("/customers", response_model=list[SpaCustomerResponse])
def list_customers(
    search: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = db.query(SpaCustomer)
    if active_only:
        query = query.filter(SpaCustomer.is_active.is_(True))

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(SpaCustomer.full_name).like(s)
            | SpaCustomer.phone.like(s)
            | func.lower(SpaCustomer.email).like(s)
        )

    customers = query.order_by(SpaCustomer.full_name.asc()).all()

    results = []
    for c in customers:
        cnt = db.query(func.count(SpaBooking.id)).filter(SpaBooking.customer_id == c.id).scalar() or 0
        resp = SpaCustomerResponse.model_validate(c)
        resp.booking_count = cnt
        results.append(resp)
    return results


@router.post("/customers", response_model=SpaCustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: SpaCustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    # Check phone duplicate
    existing = db.query(SpaCustomer).filter(SpaCustomer.phone == payload.phone.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Spa customer with phone '{payload.phone}' already exists ({existing.full_name})."
        )

    customer = SpaCustomer(
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip().lower() if payload.email else None,
        notes=payload.notes.strip() if payload.notes else None,
        is_active=payload.is_active,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    resp = SpaCustomerResponse.model_validate(customer)
    resp.booking_count = 0
    return resp


@router.get("/customers/{customer_id}", response_model=SpaCustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    c = db.get(SpaCustomer, customer_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
    cnt = db.query(func.count(SpaBooking.id)).filter(SpaBooking.customer_id == c.id).scalar() or 0
    resp = SpaCustomerResponse.model_validate(c)
    resp.booking_count = cnt
    return resp


@router.put("/customers/{customer_id}", response_model=SpaCustomerResponse)
def update_customer(
    customer_id: int,
    payload: SpaCustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    if payload.phone is not None:
        phone = payload.phone.strip()
        existing = db.query(SpaCustomer).filter(
            SpaCustomer.phone == phone,
            SpaCustomer.id != customer_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another customer with phone '{phone}' already exists."
            )
        customer.phone = phone

    if payload.full_name is not None:
        customer.full_name = payload.full_name.strip()

    if payload.email is not None:
        customer.email = payload.email.strip().lower() if payload.email else None

    if payload.notes is not None:
        customer.notes = payload.notes.strip() if payload.notes else None

    if payload.is_active is not None:
        customer.is_active = payload.is_active

    db.commit()
    db.refresh(customer)
    cnt = db.query(func.count(SpaBooking.id)).filter(SpaBooking.customer_id == customer.id).scalar() or 0
    resp = SpaCustomerResponse.model_validate(customer)
    resp.booking_count = cnt
    return resp


@router.get("/customers/{customer_id}/bookings", response_model=list[SpaBookingResponse])
def get_customer_booking_history(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    bookings = (
        db.query(SpaBooking)
        .filter(SpaBooking.customer_id == customer_id)
        .order_by(SpaBooking.booking_date.desc(), SpaBooking.start_time.desc())
        .all()
    )

    results = []
    for b in bookings:
        resp = SpaBookingResponse(
            id=b.id,
            booking_number=b.booking_number,
            customer_id=b.customer_id,
            customer_name=customer.full_name,
            customer_phone=customer.phone,
            staff_id=b.staff_id,
            therapist_name=b.therapist.full_name if b.therapist else "Therapist",
            booking_date=b.booking_date,
            start_time=b.start_time.strftime("%H:%M"),
            end_time=b.end_time.strftime("%H:%M"),
            status=b.status,
            estimated_total=b.estimated_total,
            notes=b.notes,
            created_at=b.created_at,
            updated_at=b.updated_at,
            has_invoice=b.invoice is not None,
            invoice_id=b.invoice.id if b.invoice else None,
        )
        results.append(resp)
    return results
