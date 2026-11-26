from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User, Staff
from app.core.image_upload import save_profile_image, remove_profile_image

from app.core.security import (
    verify_password,
    create_access_token
)

from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    ProfileUpdateRequest,
)

from app.api.deps import get_current_user


router = APIRouter()


# USER LOGIN
@router.post("/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.email == login_data.email
    ).first()

    if user is not None:
        user_role = getattr(user.role, "value", user.role)
        if str(user_role).upper() != "MANAGER":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff accounts are not permitted to log in."
            )

    if (
        user is None
        or not verify_password(
            login_data.password,
            user.password_hash
        )
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    biz_context = getattr(user, "business_context", "RESTAURANT") or "RESTAURANT"
    if login_data.business_context:
        requested_context = login_data.business_context.strip().upper()
        context_aliases = {"VILLAS": "VILLA", "NIWARAAI": "VILLA", "PACKAGES": "PACKAGE", "ACTIVITIES": "ACTIVITY"}
        requested_context = context_aliases.get(requested_context, requested_context)
        stored_context = str(getattr(biz_context, "value", biz_context)).strip().upper()
        stored_context = context_aliases.get(stored_context, stored_context)
        if requested_context not in {"RESTAURANT", "SPA", "VILLA", "PACKAGE", "ACTIVITY"} or requested_context != stored_context:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": str(getattr(user.role, "value", user.role)),
            "business_context": biz_context,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "business_context": biz_context,
    }


# CURRENT USER PROFILE
@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user)
):

    role = getattr(
        current_user.role,
        "value",
        current_user.role
    )
    phone = current_user.staff_profile.phone if current_user.staff_profile else None
    biz_context = getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT"

    return UserResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=str(role),
        is_active=current_user.is_active,
        business_context=biz_context,
        phone=phone,
        avatar_url=current_user.avatar_url,
    )


# UPDATE PROFILE
@router.patch("/profile", response_model=UserResponse)
def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce email uniqueness across users
    existing_user = db.query(User).filter(
        User.email == data.email,
        User.id != current_user.id
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email address is already registered to another account."
        )

    current_user.full_name = data.full_name
    current_user.email = data.email

    phone = data.phone
    if current_user.staff_profile:
        if phone:
            current_user.staff_profile.phone = phone
    elif phone:
        new_staff = Staff(
            user_id=current_user.id,
            employee_code=f"REC-{current_user.id:03d}",
            phone=phone,
            designation="Receptionist",
            joining_date=current_user.created_at.date() if current_user.created_at else None,
        )
        db.add(new_staff)

    try:
        db.commit()
        db.refresh(current_user)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile could not be updated."
        ) from exc

    role = getattr(current_user.role, "value", current_user.role)
    contact_phone = current_user.staff_profile.phone if current_user.staff_profile else phone
    biz_context = getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT"

    return UserResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=str(role),
        is_active=current_user.is_active,
        business_context=biz_context,
        phone=contact_phone,
        avatar_url=current_user.avatar_url,
    )


# UPLOAD USER PROFILE IMAGE
@router.post("/profile/image", response_model=UserResponse)
async def upload_profile_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Save new image first
    new_avatar_url = await save_profile_image(file)

    # Safely delete previous image if existed
    old_avatar_url = current_user.avatar_url
    current_user.avatar_url = new_avatar_url

    try:
        db.commit()
        db.refresh(current_user)
        if old_avatar_url and old_avatar_url != new_avatar_url:
            remove_profile_image(old_avatar_url)
    except Exception as exc:
        db.rollback()
        # Clean up newly uploaded image on DB error
        remove_profile_image(new_avatar_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save profile picture."
        ) from exc

    role = getattr(current_user.role, "value", current_user.role)
    phone = current_user.staff_profile.phone if current_user.staff_profile else None
    biz_context = getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT"

    return UserResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=str(role),
        is_active=current_user.is_active,
        business_context=biz_context,
        phone=phone,
        avatar_url=current_user.avatar_url,
    )


# REMOVE USER PROFILE IMAGE
@router.delete("/profile/image", response_model=UserResponse)
def delete_profile_image(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    old_avatar_url = current_user.avatar_url
    current_user.avatar_url = None

    try:
        db.commit()
        db.refresh(current_user)
        if old_avatar_url:
            remove_profile_image(old_avatar_url)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove profile picture."
        ) from exc

    role = getattr(current_user.role, "value", current_user.role)
    phone = current_user.staff_profile.phone if current_user.staff_profile else None
    biz_context = getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT"

    return UserResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=str(role),
        is_active=current_user.is_active,
        business_context=biz_context,
        phone=phone,
        avatar_url=current_user.avatar_url,
    )
