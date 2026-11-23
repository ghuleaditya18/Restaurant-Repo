from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.entities import Customer, User
from app.api.deps import require_roles, require_restaurant_context, require_restaurant_context_image
from app.services.entity_image_service import (
    validate_image_file,
    save_or_replace_entity_image,
    get_entity_image,
    delete_entity_image,
    build_image_response,
)

from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
)

# ==========================================
# ROUTER CONFIGURATION
# ==========================================

router = APIRouter(
    tags=["Customer Management"],
)


# ==========================================
# COMMON HELPER FUNCTIONS
# ==========================================


def get_customer_record(db: Session, customer_id: int):

    customer = db.query(Customer).filter(Customer.id == customer_id).first()

    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")

    return customer


# ==========================================
# 1. CREATE CUSTOMER
# ==========================================


@router.post("/", response_model=CustomerResponse, status_code=201, dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)])
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
):

    new_customer = Customer(
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        address=data.address,
    )

    try:

        db.add(new_customer)
        db.commit()
        db.refresh(new_customer)

        return new_customer

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Customer record conflicts with existing database information.",
        )


# ==========================================
# 2. GET ALL CUSTOMERS
# ==========================================


@router.get("/", response_model=list[CustomerResponse], dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)])
def get_all_customers(
    db: Session = Depends(get_db),
):

    customers = db.query(Customer).order_by(Customer.id.desc()).all()

    return customers


# ==========================================
# 3. GET SINGLE CUSTOMER
# ==========================================


@router.get("/{customer_id}", response_model=CustomerResponse, dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)])
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
):

    return get_customer_record(db, customer_id)


# ==========================================
# 4. UPDATE CUSTOMER
# ==========================================


@router.patch("/{customer_id}", response_model=CustomerResponse, dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)])
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
):

    customer = get_customer_record(db, customer_id)

    updates = data.model_dump(exclude_unset=True)

    try:

        for field, value in updates.items():
            setattr(customer, field, value)

        db.commit()
        db.refresh(customer)

        return customer

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Customer update conflicts with existing database information.",
        )


# ==========================================
# 5. DELETE CUSTOMER
# ==========================================


@router.delete("/{customer_id}", dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)])
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
):

    customer = get_customer_record(db, customer_id)

    # Preserve customers linked to historical orders.
    if customer.orders:

        raise HTTPException(
            status_code=409,
            detail=(
                "Customer cannot be deleted because existing orders "
                "are associated with this customer."
            ),
        )

    delete_entity_image(db, "restaurant_customer", customer.id, business_context="restaurant")
    db.delete(customer)
    db.commit()

    return {"message": "Customer deleted successfully."}


# ==========================================
# 6. CUSTOMER PROFILE IMAGE ENDPOINTS
# ==========================================

@router.post(
    "/{customer_id}/image",
    response_model=CustomerResponse,
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)
async def upload_customer_image(
    customer_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    customer = get_customer_record(db, customer_id)
    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)

    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="restaurant_customer",
        business_context="restaurant",
        entity_id=customer.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )

    v = int(img_record.updated_at.timestamp())
    customer.image_url = f"/api/customers/{customer.id}/image?v={v}"
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/image")
def get_customer_image_endpoint(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_restaurant_context_image),
):
    customer = get_customer_record(db, customer_id)
    img_record = get_entity_image(db, "restaurant_customer", customer.id, business_context="restaurant")
    if not img_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer photograph not found.",
        )

    if_none_match = request.headers.get("if-none-match")
    return build_image_response(img_record, if_none_match)


@router.delete(
    "/{customer_id}/image",
    response_model=CustomerResponse,
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)
def delete_customer_image_endpoint(
    customer_id: int,
    db: Session = Depends(get_db),
):
    customer = get_customer_record(db, customer_id)
    delete_entity_image(db, "restaurant_customer", customer.id, business_context="restaurant")
    customer.image_url = None
    db.commit()
    db.refresh(customer)
    return customer
