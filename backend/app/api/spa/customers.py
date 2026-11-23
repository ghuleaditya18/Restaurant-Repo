from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_spa_context, require_spa_context_image
from app.models.entities import User
from app.models.spa import SpaCustomer, SpaBooking
from app.services.entity_image_service import (
    validate_image_file,
    save_or_replace_entity_image,
    get_entity_image,
    delete_entity_image,
    build_image_response,
)
from app.schemas.spa import (
    SpaCustomerCreate,
    SpaCustomerUpdate,
    SpaCustomerResponse,
    SpaBookingResponse,
)

router = APIRouter()


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


@router.delete("/customers/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    has_bookings = (
        db.query(SpaBooking.id)
        .filter(SpaBooking.customer_id == customer_id)
        .first()
        is not None
    )

    if has_bookings:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Customer cannot be deleted because existing bookings are associated with this customer. Deactivate the customer instead.",
        )

    delete_entity_image(db, "spa_customer", customer_id, business_context="spa")
    db.delete(customer)
    db.commit()

    return {"message": f"Customer '{customer.full_name}' deleted successfully."}


@router.post("/customers/{customer_id}/image", response_model=SpaCustomerResponse)
async def upload_spa_customer_image(
    customer_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)

    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="spa_customer",
        business_context="spa",
        entity_id=customer.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )

    v = int(img_record.updated_at.timestamp())
    customer.image_url = f"/api/spa/customers/{customer.id}/image?v={v}"
    db.commit()
    db.refresh(customer)

    cnt = db.query(func.count(SpaBooking.id)).filter(SpaBooking.customer_id == customer.id).scalar() or 0
    resp = SpaCustomerResponse.model_validate(customer)
    resp.booking_count = cnt
    return resp


@router.get("/customers/{customer_id}/image")
def get_spa_customer_image_endpoint(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context_image),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    img_record = get_entity_image(db, "spa_customer", customer.id, business_context="spa")
    if not img_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spa customer photograph not found.",
        )

    if_none_match = request.headers.get("if-none-match")
    return build_image_response(img_record, if_none_match)


@router.delete("/customers/{customer_id}/image", response_model=SpaCustomerResponse)
def delete_spa_customer_image_endpoint(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    customer = db.get(SpaCustomer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    delete_entity_image(db, "spa_customer", customer.id, business_context="spa")
    customer.image_url = None
    db.commit()
    db.refresh(customer)

    cnt = db.query(func.count(SpaBooking.id)).filter(SpaBooking.customer_id == customer.id).scalar() or 0
    resp = SpaCustomerResponse.model_validate(customer)
    resp.booking_count = cnt
    return resp
