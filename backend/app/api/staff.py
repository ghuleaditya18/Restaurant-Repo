from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models import Order, OrderStatusHistory, User, Staff

from app.core.security import hash_password
from app.api.deps import require_roles

from app.schemas.staff import (
    StaffCreate,
    StaffPut,
    StaffUpdate,
    StaffStatusUpdate,
    StaffPasswordReset,
    StaffResponse,
)


router = APIRouter(
    dependencies=[Depends(require_roles("MANAGER"))]
)


# Convert database records into response
def staff_to_response(staff, user):

    return StaffResponse(
        id=staff.id,
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        employee_code=staff.employee_code,
        phone=staff.phone,
        designation=staff.designation,
        joining_date=staff.joining_date,
        is_active=user.is_active,
    )


# Get staff record
def get_staff_record(db: Session, staff_id: int):

    result = (
        db.query(Staff, User)
        .join(User, Staff.user_id == User.id)
        .filter(Staff.id == staff_id)
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Staff member not found."
        )

    return result


# Check duplicate email and employee code
def check_unique_fields(db, staff, user, updates):

    if "email" in updates:

        existing_email = db.query(User).filter(
            User.email == updates["email"],
            User.id != user.id
        ).first()

        if existing_email:
            raise HTTPException(
                status_code=409,
                detail="Email address already registered."
            )

    if "employee_code" in updates:

        existing_code = db.query(Staff).filter(
            Staff.employee_code == updates["employee_code"],
            Staff.id != staff.id
        ).first()

        if existing_code:
            raise HTTPException(
                status_code=409,
                detail="Employee code already exists."
            )


# Apply staff updates
def apply_staff_updates(staff, user, updates):

    user_fields = {"full_name", "email"}

    staff_fields = {
        "employee_code",
        "phone",
        "designation",
        "joining_date"
    }

    for field, value in updates.items():

        if field in user_fields:
            setattr(user, field, value)

        elif field in staff_fields:
            setattr(staff, field, value)


# 1. CREATE STAFF
@router.post("/", response_model=StaffResponse, status_code=201)
def create_staff(
    data: StaffCreate,
    db: Session = Depends(get_db),
):

    existing_email = db.query(User).filter(
        User.email == data.email
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=409,
            detail="Email address already registered."
        )

    existing_code = db.query(Staff).filter(
        Staff.employee_code == data.employee_code
    ).first()

    if existing_code:
        raise HTTPException(
            status_code=409,
            detail="Employee code already exists."
        )

    try:
        import secrets

        role_enum = User.__table__.c.role.type.enum_class
        raw_password = data.password if data.password else secrets.token_urlsafe(32)

        new_user = User(
            full_name=data.full_name,
            email=data.email,
            password_hash=hash_password(raw_password),
            role=role_enum.STAFF,
            is_active=True,
        )

        db.add(new_user)
        db.flush()

        new_staff = Staff(
            user_id=new_user.id,
            employee_code=data.employee_code,
            phone=data.phone,
            designation=data.designation,
            joining_date=data.joining_date,
        )

        db.add(new_staff)

        db.commit()

        db.refresh(new_user)
        db.refresh(new_staff)

        return staff_to_response(new_staff, new_user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Staff record conflicts with existing database information."
        )


# 2. GET ALL STAFF
@router.get("/", response_model=list[StaffResponse])
def get_all_staff(db: Session = Depends(get_db)):

    records = (
        db.query(Staff, User)
        .join(User, Staff.user_id == User.id)
        .order_by(Staff.id.desc())
        .all()
    )

    return [
        staff_to_response(staff, user)
        for staff, user in records
    ]


# 3. GET SINGLE STAFF
@router.get("/{staff_id}", response_model=StaffResponse)
def get_staff(
    staff_id: int,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    return staff_to_response(staff, user)


# 4. PUT - COMPLETE STAFF UPDATE
@router.put("/{staff_id}", response_model=StaffResponse)
def replace_staff(
    staff_id: int,
    data: StaffPut,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    updates = data.model_dump()

    check_unique_fields(
        db, staff, user, updates
    )

    try:

        apply_staff_updates(staff, user, updates)

        db.commit()

        db.refresh(user)
        db.refresh(staff)

        return staff_to_response(staff, user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Staff update conflicts with existing database information."
        )


# 5. PATCH - PARTIAL STAFF UPDATE
@router.patch("/{staff_id}", response_model=StaffResponse)
def update_staff(
    staff_id: int,
    data: StaffUpdate,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    updates = data.model_dump(exclude_unset=True)

    check_unique_fields(
        db, staff, user, updates
    )

    try:

        apply_staff_updates(staff, user, updates)

        db.commit()

        db.refresh(user)
        db.refresh(staff)

        return staff_to_response(staff, user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Update conflicts with existing database information."
        )


# 6. ACTIVATE / DEACTIVATE STAFF
@router.patch("/{staff_id}/status", response_model=StaffResponse)
def update_staff_status(
    staff_id: int,
    data: StaffStatusUpdate,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    user.is_active = data.is_active

    db.commit()

    db.refresh(user)

    return staff_to_response(staff, user)


# 7. DELETE STAFF
@router.delete("/{staff_id}")
def delete_staff(
    staff_id: int,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    # Preserve the user account when historical records refer to it, while
    # preventing the account from being used to sign in again.
    has_history = (
        db.query(Order.id)
        .filter(Order.created_by_user_id == user.id)
        .first()
        is not None
    ) or (
        db.query(OrderStatusHistory.id)
        .filter(OrderStatusHistory.changed_by_user_id == user.id)
        .first()
        is not None
    )

    try:
        db.delete(staff)
        db.flush()

        if has_history:
            user.is_active = False
        else:
            db.delete(user)

        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Staff member cannot be deleted because existing records still reference the account.",
        )

    return {
        "message": (
            "Staff member deleted. The account was deactivated to preserve historical records."
            if has_history
            else "Staff member deleted successfully."
        )
    }



# 8. RESET STAFF PASSWORD
@router.patch("/{staff_id}/password")
def reset_staff_password(
    staff_id: int,
    data: StaffPasswordReset,
    db: Session = Depends(get_db),
):

    staff, user = get_staff_record(db, staff_id)

    user.password_hash = hash_password(data.password)
    db.commit()

    return {
        "message": f"Password for staff member '{user.full_name}' was reset successfully."
    }
