from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.entities import Customer
from app.api.deps import require_roles

from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
)

# ==========================================
# ROUTER CONFIGURATION
# ==========================================

router = APIRouter(
    tags=["Customer Management"], dependencies=[Depends(require_roles("MANAGER"))]
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


@router.post("/", response_model=CustomerResponse, status_code=201)
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


@router.get("/", response_model=list[CustomerResponse])
def get_all_customers(
    db: Session = Depends(get_db),
):

    customers = db.query(Customer).order_by(Customer.id.desc()).all()

    return customers


# ==========================================
# 3. GET SINGLE CUSTOMER
# ==========================================


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
):

    return get_customer_record(db, customer_id)


# ==========================================
# 4. UPDATE CUSTOMER
# ==========================================


@router.patch("/{customer_id}", response_model=CustomerResponse)
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


@router.delete("/{customer_id}")
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

    db.delete(customer)
    db.commit()

    return {"message": "Customer deleted successfully."}
