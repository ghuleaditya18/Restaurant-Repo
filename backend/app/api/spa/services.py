from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import SpaService, SpaServiceCategory
from app.schemas.spa import (
    SpaServiceCategoryCreate,
    SpaServiceCategoryUpdate,
    SpaServiceCategoryResponse,
    SpaServiceCreate,
    SpaServiceUpdate,
    SpaServiceResponse,
)

router = APIRouter(dependencies=[Depends(require_spa_context)])


# ==========================================
# CATEGORIES
# ==========================================

@router.get("/service-categories", response_model=list[SpaServiceCategoryResponse])
def list_categories(
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = db.query(SpaServiceCategory)
    if active_only:
        query = query.filter(SpaServiceCategory.is_active.is_(True))
    categories = query.order_by(SpaServiceCategory.name.asc()).all()

    results = []
    for cat in categories:
        svc_count = db.query(func.count(SpaService.id)).filter(SpaService.category_id == cat.id).scalar() or 0
        resp = SpaServiceCategoryResponse.model_validate(cat)
        resp.service_count = svc_count
        results.append(resp)
    return results


@router.post("/service-categories", response_model=SpaServiceCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: SpaServiceCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    existing = db.query(SpaServiceCategory).filter(
        func.lower(SpaServiceCategory.name) == payload.name.strip().lower()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Service category '{payload.name}' already exists."
        )

    cat = SpaServiceCategory(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    resp = SpaServiceCategoryResponse.model_validate(cat)
    resp.service_count = 0
    return resp


@router.put("/service-categories/{category_id}", response_model=SpaServiceCategoryResponse)
def update_category(
    category_id: int,
    payload: SpaServiceCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    cat = db.get(SpaServiceCategory, category_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if payload.name is not None:
        name = payload.name.strip()
        existing = db.query(SpaServiceCategory).filter(
            func.lower(SpaServiceCategory.name) == name.lower(),
            SpaServiceCategory.id != category_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another category with name '{name}' already exists."
            )
        cat.name = name

    if payload.description is not None:
        cat.description = payload.description.strip() if payload.description else None

    if payload.is_active is not None:
        cat.is_active = payload.is_active

    db.commit()
    db.refresh(cat)
    svc_count = db.query(func.count(SpaService.id)).filter(SpaService.category_id == cat.id).scalar() or 0
    resp = SpaServiceCategoryResponse.model_validate(cat)
    resp.service_count = svc_count
    return resp


@router.delete("/service-categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    cat = db.get(SpaServiceCategory, category_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    service_count = db.query(func.count(SpaService.id)).filter(SpaService.category_id == category_id).scalar() or 0
    if service_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete category with {service_count} associated services. Deactivate it instead."
        )

    db.delete(cat)
    db.commit()
    return {"message": "Category deleted successfully"}


# ==========================================
# SERVICES
# ==========================================

@router.get("/services", response_model=list[SpaServiceResponse])
def list_services(
    category_id: int | None = None,
    available_only: bool = False,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    query = db.query(SpaService).join(SpaServiceCategory, SpaService.category_id == SpaServiceCategory.id)

    if category_id:
        query = query.filter(SpaService.category_id == category_id)

    if available_only:
        query = query.filter(
            SpaService.is_available.is_(True),
            SpaServiceCategory.is_active.is_(True),
        )

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(func.lower(SpaService.name).like(s))

    services = query.order_by(SpaServiceCategory.name.asc(), SpaService.name.asc()).all()

    results = []
    for svc in services:
        resp = SpaServiceResponse.model_validate(svc)
        resp.category_name = svc.category.name if svc.category else None
        results.append(resp)
    return results


@router.post("/services", response_model=SpaServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: SpaServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    cat = db.get(SpaServiceCategory, payload.category_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    service = SpaService(
        category_id=payload.category_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        price=payload.price,
        duration_minutes=payload.duration_minutes,
        is_available=payload.is_available,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    resp = SpaServiceResponse.model_validate(service)
    resp.category_name = cat.name
    return resp


@router.get("/services/{service_id}", response_model=SpaServiceResponse)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    service = db.get(SpaService, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    resp = SpaServiceResponse.model_validate(service)
    resp.category_name = service.category.name if service.category else None
    return resp


@router.put("/services/{service_id}", response_model=SpaServiceResponse)
def update_service(
    service_id: int,
    payload: SpaServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    service = db.get(SpaService, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if payload.category_id is not None:
        cat = db.get(SpaServiceCategory, payload.category_id)
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
        service.category_id = payload.category_id

    if payload.name is not None:
        service.name = payload.name.strip()

    if payload.description is not None:
        service.description = payload.description.strip() if payload.description else None

    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Price cannot be negative.")
        service.price = payload.price

    if payload.duration_minutes is not None:
        if payload.duration_minutes <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duration must be positive.")
        service.duration_minutes = payload.duration_minutes

    if payload.is_available is not None:
        service.is_available = payload.is_available

    db.commit()
    db.refresh(service)
    resp = SpaServiceResponse.model_validate(service)
    resp.category_name = service.category.name if service.category else None
    return resp


@router.delete("/services/{service_id}")
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    service = db.get(SpaService, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    # Soft delete / deactivate to preserve historical bookings
    service.is_available = False
    db.commit()
    return {"message": "Service deactivated successfully"}
