from datetime import date, time, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import (
    SpaBooking,
    SpaBookingService,
    SpaBookingStatusHistory,
    SpaBookingStatus,
    SpaCustomer,
    SpaStaff,
)
from app.schemas.spa import (
    SpaBookingCreate,
    SpaBookingRescheduleInput,
    SpaBookingStatusUpdate,
    SpaBookingResponse,
    SpaBookingServiceResponse,
    SpaBookingStatusHistoryResponse,
    SpaAvailableSlotsResponse,
)
from app.services.spa_service import (
    create_booking_record,
    transition_booking_status,
    reschedule_booking,
    validate_therapist_availability_and_conflict,
    generate_available_slots,
    parse_time_string,
    calculate_services_duration_and_total,
    time_to_seconds,
    seconds_to_time,
)

router = APIRouter(dependencies=[Depends(require_spa_context)])


def build_booking_response(b: SpaBooking, db: Session) -> SpaBookingResponse:
    services = [
        SpaBookingServiceResponse(
            id=bs.id,
            service_id=bs.service_id,
            service_name=bs.service_name,
            unit_price=bs.unit_price,
            duration_minutes=bs.duration_minutes,
            quantity=bs.quantity,
            subtotal=bs.subtotal,
        )
        for bs in b.booking_services
    ]

    history = []
    for h in b.status_history:
        changer_name = None
        if h.changed_by:
            u = db.get(User, h.changed_by)
            changer_name = u.full_name if u else None
        history.append(
            SpaBookingStatusHistoryResponse(
                id=h.id,
                previous_status=h.previous_status,
                new_status=h.new_status,
                changed_by=h.changed_by,
                changed_by_name=changer_name,
                note=h.note,
                changed_at=h.changed_at,
            )
        )

    return SpaBookingResponse(
        id=b.id,
        booking_number=b.booking_number,
        customer_id=b.customer_id,
        customer_name=b.customer.full_name if b.customer else "Customer",
        customer_phone=b.customer.phone if b.customer else "",
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
        booking_services=services,
        status_history=history,
        has_invoice=b.invoice is not None,
        invoice_id=b.invoice.id if b.invoice else None,
    )


@router.get("/bookings", response_model=list[SpaBookingResponse])
def list_bookings(
    booking_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    staff_id: int | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = (
        db.query(SpaBooking)
        .options(
            joinedload(SpaBooking.customer),
            joinedload(SpaBooking.therapist),
            joinedload(SpaBooking.booking_services),
            joinedload(SpaBooking.status_history),
            joinedload(SpaBooking.invoice),
        )
    )

    if booking_date:
        query = query.filter(SpaBooking.booking_date == booking_date)
    else:
        if start_date:
            query = query.filter(SpaBooking.booking_date >= start_date)
        if end_date:
            query = query.filter(SpaBooking.booking_date <= end_date)

    if status_filter:
        query = query.filter(func.lower(SpaBooking.status) == status_filter.strip().lower())

    if staff_id:
        query = query.filter(SpaBooking.staff_id == staff_id)

    if customer_id:
        query = query.filter(SpaBooking.customer_id == customer_id)

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.join(SpaCustomer, SpaBooking.customer_id == SpaCustomer.id).filter(
            func.lower(SpaBooking.booking_number).like(s)
            | func.lower(SpaCustomer.full_name).like(s)
            | SpaCustomer.phone.like(s)
        )

    bookings = query.order_by(SpaBooking.booking_date.desc(), SpaBooking.start_time.desc()).all()
    return [build_booking_response(b, db) for b in bookings]


@router.get("/bookings/available-slots", response_model=SpaAvailableSlotsResponse)
def get_available_slots_endpoint(
    staff_id: int,
    booking_date: date,
    service_ids: str | None = Query(default=None),
    duration_minutes: int | None = Query(default=None),
    exclude_booking_id: int | None = Query(default=None),
    booking_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    service_items = None
    if service_ids:
        s_ids = [int(x.strip()) for x in service_ids.split(",") if x.strip()]
        service_items = [{"service_id": sid, "quantity": 1} for sid in s_ids]

    eff_exclude_id = exclude_booking_id or booking_id
    slots_data = generate_available_slots(
        db=db,
        staff_id=staff_id,
        booking_date=booking_date,
        service_items=service_items,
        total_duration_minutes=duration_minutes,
        exclude_booking_id=eff_exclude_id,
    )
    return slots_data


@router.get("/bookings/check-conflict")
def check_therapist_conflict_slot(
    staff_id: int,
    booking_date: date,
    start_time: str,
    duration_minutes: int,
    exclude_booking_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    st_time = parse_time_string(start_time)
    start_sec = time_to_seconds(st_time)
    end_sec = start_sec + (duration_minutes * 60)
    end_time = seconds_to_time(end_sec)

    try:
        staff = validate_therapist_availability_and_conflict(
            db=db,
            staff_id=staff_id,
            booking_date=booking_date,
            start_time=st_time,
            end_time=end_time,
            exclude_booking_id=exclude_booking_id,
        )
        disp_start = datetime.strptime(st_time.strftime("%H:%M"), "%H:%M").strftime("%I:%M %p")
        disp_end = datetime.strptime(end_time.strftime("%H:%M"), "%H:%M").strftime("%I:%M %p")
        return {
            "available": True,
            "therapist_name": staff.full_name,
            "start_time": st_time.strftime("%H:%M"),
            "end_time": end_time.strftime("%H:%M"),
            "display_text": f"{disp_start} - {disp_end}",
            "message": "Time slot is available.",
        }
    except HTTPException as exc:
        return {
            "available": False,
            "status_code": exc.status_code,
            "detail": exc.detail,
        }


@router.post("/bookings", response_model=SpaBookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: SpaBookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    service_items_dict = [
        {"service_id": it.service_id, "quantity": it.quantity}
        for it in payload.service_items
    ]

    new_cust_dict = None
    if payload.new_customer:
        new_cust_dict = payload.new_customer.model_dump()

    booking = create_booking_record(
        db=db,
        customer_id=payload.customer_id,
        new_customer_data=new_cust_dict,
        staff_id=payload.staff_id,
        booking_date=payload.booking_date,
        start_time_str=payload.start_time,
        service_items=service_items_dict,
        notes=payload.notes,
        created_by_user_id=current_user.id,
    )
    return build_booking_response(booking, db)


@router.get("/bookings/{booking_id}", response_model=SpaBookingResponse)
def get_booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    booking = (
        db.query(SpaBooking)
        .options(
            joinedload(SpaBooking.customer),
            joinedload(SpaBooking.therapist),
            joinedload(SpaBooking.booking_services),
            joinedload(SpaBooking.status_history),
            joinedload(SpaBooking.invoice),
        )
        .filter(SpaBooking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    return build_booking_response(booking, db)


@router.patch("/bookings/{booking_id}/status", response_model=SpaBookingResponse)
def update_booking_status(
    booking_id: int,
    payload: SpaBookingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    booking = transition_booking_status(
        db=db,
        booking_id=booking_id,
        new_status_raw=payload.status,
        changed_by_user_id=current_user.id,
        note=payload.note,
    )
    return build_booking_response(booking, db)


@router.post("/bookings/{booking_id}/reschedule", response_model=SpaBookingResponse)
def reschedule_existing_booking(
    booking_id: int,
    payload: SpaBookingRescheduleInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    booking = reschedule_booking(
        db=db,
        booking_id=booking_id,
        new_date=payload.booking_date,
        new_start_time_str=payload.start_time,
        new_staff_id=payload.staff_id,
        changed_by_user_id=current_user.id,
    )
    return build_booking_response(booking, db)
