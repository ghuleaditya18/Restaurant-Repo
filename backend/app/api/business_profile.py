from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User, BusinessProfile
from app.api.deps import get_current_user
from app.core.image_upload import save_founder_image, remove_founder_image
from app.schemas.business_profile import (
    BusinessProfileResponse,
    BusinessProfileUpdateRequest,
)

router = APIRouter()

REQUIRED_PROFILE_FIELDS = [
    ("business_name", "Business / Establishment Name"),
    ("description", "Main Description"),
    ("business_email", "Official Business Email"),
    ("business_phone", "Business Contact Phone"),
    ("address_line", "Address Line"),
    ("city", "City"),
]


def _check_manager_authorization(user: User):
    role = str(getattr(user.role, "value", user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business managers or administrators are authorized to update business details."
        )


def _get_missing_fields(profile: BusinessProfile) -> list[str]:
    missing = []
    for field_name, label in REQUIRED_PROFILE_FIELDS:
        val = getattr(profile, field_name, None)
        if not val or not str(val).strip():
            missing.append(label)
    return missing


def _build_response(profile: BusinessProfile) -> BusinessProfileResponse:
    missing = _get_missing_fields(profile)
    return BusinessProfileResponse(
        id=profile.id,
        business_context=profile.business_context,
        business_name=profile.business_name,
        business_type=profile.business_type,
        business_category=profile.business_category,
        tagline=profile.tagline,
        description=profile.description,
        established_year=profile.established_year,
        story_heading=profile.story_heading,
        story_subheading=profile.story_subheading,
        story_content=profile.story_content,
        founder_name=profile.founder_name,
        founder_designation=profile.founder_designation,
        founder_bio=profile.founder_bio,
        founder_quote=profile.founder_quote,
        founder_image_url=profile.founder_image_url,
        business_email=profile.business_email,
        business_phone=profile.business_phone,
        address_line=profile.address_line,
        city=profile.city,
        state=profile.state,
        postal_code=profile.postal_code,
        country=profile.country or "India",
        operating_hours=profile.operating_hours,
        weekly_closed_days=profile.weekly_closed_days,
        business_highlights=profile.business_highlights,
        is_profile_complete=profile.is_profile_complete,
        missing_fields=missing,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.get("", response_model=BusinessProfileResponse)
def get_business_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    biz_context = (getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT").upper()

    profile = db.query(BusinessProfile).filter(
        BusinessProfile.business_context == biz_context
    ).first()

    if not profile:
        profile = BusinessProfile(
            business_context=biz_context,
            business_name=f"DineFlow {biz_context.capitalize()}",
            is_profile_complete=False,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return _build_response(profile)


@router.put("", response_model=BusinessProfileResponse)
@router.patch("", response_model=BusinessProfileResponse)
def update_business_profile(
    data: BusinessProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_manager_authorization(current_user)
    biz_context = (getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT").upper()

    profile = db.query(BusinessProfile).filter(
        BusinessProfile.business_context == biz_context
    ).first()

    if not profile:
        profile = BusinessProfile(
            business_context=biz_context,
            business_name=data.business_name,
            is_profile_complete=False,
        )
        db.add(profile)

    # Update fields
    profile.business_name = data.business_name
    profile.business_type = data.business_type
    profile.business_category = data.business_category
    profile.tagline = data.tagline
    profile.description = data.description
    profile.established_year = data.established_year

    profile.story_heading = data.story_heading
    profile.story_subheading = data.story_subheading
    profile.story_content = data.story_content

    profile.founder_name = data.founder_name
    profile.founder_designation = data.founder_designation
    profile.founder_bio = data.founder_bio
    profile.founder_quote = data.founder_quote

    profile.business_email = data.business_email
    profile.business_phone = data.business_phone

    profile.address_line = data.address_line
    profile.city = data.city
    profile.state = data.state
    profile.postal_code = data.postal_code
    profile.country = data.country or "India"

    profile.operating_hours = data.operating_hours
    profile.weekly_closed_days = data.weekly_closed_days
    profile.business_highlights = data.business_highlights

    # Evaluate profile completeness
    missing = _get_missing_fields(profile)
    profile.is_profile_complete = (len(missing) == 0)

    try:
        db.commit()
        db.refresh(profile)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update business profile."
        ) from exc

    return _build_response(profile)


@router.post("/founder-image", response_model=BusinessProfileResponse)
async def upload_founder_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_manager_authorization(current_user)
    biz_context = (getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT").upper()

    profile = db.query(BusinessProfile).filter(
        BusinessProfile.business_context == biz_context
    ).first()

    if not profile:
        profile = BusinessProfile(
            business_context=biz_context,
            business_name=f"DineFlow {biz_context.capitalize()}",
            is_profile_complete=False,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    new_image_url = await save_founder_image(file)
    old_image_url = profile.founder_image_url
    profile.founder_image_url = new_image_url

    try:
        db.commit()
        db.refresh(profile)
        if old_image_url and old_image_url != new_image_url:
            remove_founder_image(old_image_url)
    except Exception as exc:
        db.rollback()
        remove_founder_image(new_image_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save founder photograph."
        ) from exc

    return _build_response(profile)


@router.delete("/founder-image", response_model=BusinessProfileResponse)
def delete_founder_image(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_manager_authorization(current_user)
    biz_context = (getattr(current_user, "business_context", "RESTAURANT") or "RESTAURANT").upper()

    profile = db.query(BusinessProfile).filter(
        BusinessProfile.business_context == biz_context
    ).first()

    if profile and profile.founder_image_url:
        old_image_url = profile.founder_image_url
        profile.founder_image_url = None
        try:
            db.commit()
            db.refresh(profile)
            remove_founder_image(old_image_url)
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to remove founder photograph."
            ) from exc

    return _build_response(profile)
