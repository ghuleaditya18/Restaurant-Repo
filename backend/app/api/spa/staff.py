from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_spa_context, require_spa_context_image
from app.models.entities import User
from app.models.spa import (
    SpaStaff,
    SpaStaffAvailability,
    SpaBooking,
    SpaBookingStatus,
)
from app.services.entity_image_service import (
    validate_image_file,
    save_or_replace_entity_image,
    get_entity_image,
    delete_entity_image,
    build_image_response,
)
from app.schemas.spa import (
    SpaStaffCreate,
    SpaStaffUpdate,
    SpaStaffResponse,
    SpaStaffAvailabilityCreate,
    SpaStaffAvailabilityResponse,
    SpaBookingResponse,
)
from app.services.spa_service import parse_time_string

router = APIRouter()


def build_staff_response(st: SpaStaff, db: Session) -> SpaStaffResponse:
    active_bkg_count = (
        db.query(func.count(SpaBooking.id))
        .filter(
            SpaBooking.staff_id == st.id,
            SpaBooking.status.notin_([
                SpaBookingStatus.COMPLETED.value,
                SpaBookingStatus.CANCELLED.value,
                SpaBookingStatus.NO_SHOW.value,
            ])
        )
        .scalar() or 0
    )

    availabilities = []
    for av in st.availabilities:
        st_str = av.start_time.strftime("%H:%M") if hasattr(av.start_time, "strftime") else str(av.start_time)
        end_str = av.end_time.strftime("%H:%M") if hasattr(av.end_time, "strftime") else str(av.end_time)
        availabilities.append(
            SpaStaffAvailabilityResponse(
                id=av.id,
                staff_id=av.staff_id,
                day_of_week=av.day_of_week,
                start_time=st_str,
                end_time=end_str,
                is_available=av.is_available,
            )
        )

    return SpaStaffResponse(
        id=st.id,
        employee_code=st.employee_code,
        full_name=st.full_name,
        designation=st.designation,
        phone=st.phone,
        email=st.email,
        specialization=st.specialization,
        is_therapist=st.is_therapist,
        is_active=st.is_active,
        image_url=st.image_url,
        created_at=st.created_at,
        updated_at=st.updated_at,
        availabilities=availabilities,
        active_booking_count=active_bkg_count,
    )


@router.get("/staff", response_model=list[SpaStaffResponse])
def list_staff(
    therapists_only: bool = False,
    active_only: bool = False,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = db.query(SpaStaff)
    if therapists_only:
        query = query.filter(SpaStaff.is_therapist.is_(True))
    if active_only:
        query = query.filter(SpaStaff.is_active.is_(True))

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(SpaStaff.full_name).like(s)
            | func.lower(SpaStaff.employee_code).like(s)
            | func.lower(SpaStaff.designation).like(s)
            | func.lower(SpaStaff.specialization).like(s)
        )

    staff_members = query.order_by(SpaStaff.full_name.asc()).all()
    return [build_staff_response(st, db) for st in staff_members]


@router.post("/staff", response_model=SpaStaffResponse, status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: SpaStaffCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    existing = db.query(SpaStaff).filter(
        SpaStaff.employee_code == payload.employee_code.strip()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee code '{payload.employee_code}' already exists."
        )

    staff = SpaStaff(
        employee_code=payload.employee_code.strip(),
        full_name=payload.full_name.strip(),
        designation=payload.designation.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip().lower() if payload.email else None,
        specialization=payload.specialization.strip() if payload.specialization else None,
        is_therapist=payload.is_therapist,
        is_active=payload.is_active,
    )
    db.add(staff)
    db.flush()

    for av_data in payload.availabilities:
        st_time = parse_time_string(av_data.start_time)
        end_time = parse_time_string(av_data.end_time)
        av = SpaStaffAvailability(
            staff_id=staff.id,
            day_of_week=av_data.day_of_week,
            start_time=st_time,
            end_time=end_time,
            is_available=av_data.is_available,
        )
        db.add(av)

    db.commit()
    db.refresh(staff)
    return build_staff_response(staff, db)


@router.get("/staff/{staff_id}", response_model=SpaStaffResponse)
def get_staff_detail(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    st = db.get(SpaStaff, staff_id)
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    return build_staff_response(st, db)


@router.put("/staff/{staff_id}", response_model=SpaStaffResponse)
def update_staff(
    staff_id: int,
    payload: SpaStaffUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    if payload.employee_code is not None:
        code = payload.employee_code.strip()
        existing = db.query(SpaStaff).filter(
            SpaStaff.employee_code == code,
            SpaStaff.id != staff_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another staff member with code '{code}' already exists."
            )
        staff.employee_code = code

    if payload.full_name is not None:
        staff.full_name = payload.full_name.strip()

    if payload.designation is not None:
        staff.designation = payload.designation.strip()

    if payload.phone is not None:
        staff.phone = payload.phone.strip()

    if payload.email is not None:
        staff.email = payload.email.strip().lower() if payload.email else None

    if payload.specialization is not None:
        staff.specialization = payload.specialization.strip() if payload.specialization else None

    if payload.is_therapist is not None:
        staff.is_therapist = payload.is_therapist

    if payload.is_active is not None:
        staff.is_active = payload.is_active

    if payload.availabilities is not None:
        # Replace availabilities
        db.query(SpaStaffAvailability).filter(SpaStaffAvailability.staff_id == staff_id).delete()
        for av_data in payload.availabilities:
            st_time = parse_time_string(av_data.start_time)
            end_time = parse_time_string(av_data.end_time)
            av = SpaStaffAvailability(
                staff_id=staff.id,
                day_of_week=av_data.day_of_week,
                start_time=st_time,
                end_time=end_time,
                is_available=av_data.is_available,
            )
            db.add(av)

    db.commit()
    db.refresh(staff)
    return build_staff_response(staff, db)


@router.put("/staff/{staff_id}/availability", response_model=list[SpaStaffAvailabilityResponse])
def update_staff_availability(
    staff_id: int,
    availabilities: list[SpaStaffAvailabilityCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    db.query(SpaStaffAvailability).filter(SpaStaffAvailability.staff_id == staff_id).delete()

    created = []
    for av_data in availabilities:
        st_time = parse_time_string(av_data.start_time)
        end_time = parse_time_string(av_data.end_time)
        av = SpaStaffAvailability(
            staff_id=staff.id,
            day_of_week=av_data.day_of_week,
            start_time=st_time,
            end_time=end_time,
            is_available=av_data.is_available,
        )
        db.add(av)
        created.append(av)

    db.commit()
    return [
        SpaStaffAvailabilityResponse(
            id=av.id,
            staff_id=av.staff_id,
            day_of_week=av.day_of_week,
            start_time=av.start_time.strftime("%H:%M") if hasattr(av.start_time, "strftime") else str(av.start_time),
            end_time=av.end_time.strftime("%H:%M") if hasattr(av.end_time, "strftime") else str(av.end_time),
            is_available=av.is_available,
        )
        for av in created
    ]


@router.delete("/staff/{staff_id}")
def delete_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found."
        )

    has_bookings = (
        db.query(SpaBooking.id)
        .filter(SpaBooking.staff_id == staff_id)
        .first()
        is not None
    )

    if has_bookings:
        # Soft delete / deactivate to preserve historical booking relationships
        staff.is_active = False
        db.commit()
        return {
            "message": f"Staff member '{staff.full_name}' has booking records. Account was deactivated to preserve historical records.",
            "deactivated": True,
        }

    # Delete unreferenced staff member and cascade availability
    delete_entity_image(db, "spa_staff", staff_id, business_context="spa")
    db.delete(staff)
    db.commit()

    return {
        "message": f"Staff member '{staff.full_name}' deleted successfully.",
        "deactivated": False,
    }


@router.post("/staff/{staff_id}/image", response_model=SpaStaffResponse)
async def upload_spa_staff_image(
    staff_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)

    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="spa_staff",
        business_context="spa",
        entity_id=staff.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )

    v = int(img_record.updated_at.timestamp())
    staff.image_url = f"/api/spa/staff/{staff.id}/image?v={v}"
    db.commit()
    db.refresh(staff)

    return build_staff_response(staff, db)


@router.get("/staff/{staff_id}/image")
def get_spa_staff_image_endpoint(
    staff_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context_image),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    img_record = get_entity_image(db, "spa_staff", staff.id, business_context="spa")
    if not img_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spa staff photograph not found.",
        )

    if_none_match = request.headers.get("if-none-match")
    return build_image_response(img_record, if_none_match)


@router.delete("/staff/{staff_id}/image", response_model=SpaStaffResponse)
def delete_spa_staff_image_endpoint(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    staff = db.get(SpaStaff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    delete_entity_image(db, "spa_staff", staff.id, business_context="spa")
    staff.image_url = None
    db.commit()
    db.refresh(staff)

    return build_staff_response(staff, db)
