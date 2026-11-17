from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.entities import (
    RestaurantTable,
    Order,
    OrderStatus,
    TableStatus,
)
from app.api.deps import require_roles

from app.schemas.table import (
    TableCreate,
    TableUpdate,
    TableResponse,
)

# ==========================================
# ROUTER CONFIGURATION
# ==========================================

router = APIRouter(
    tags=["Table Management"], dependencies=[Depends(require_roles("MANAGER"))]
)


# ==========================================
# COMMON HELPER FUNCTIONS
# ==========================================


def get_table_record(db: Session, table_id: int):

    table = db.query(RestaurantTable).filter(RestaurantTable.id == table_id).first()

    if table is None:
        raise HTTPException(status_code=404, detail="Restaurant table not found.")

    return table


def has_active_orders(db: Session, table_id: int):

    active_order = (
        db.query(Order.id)
        .filter(
            Order.table_id == table_id,
            Order.status.notin_(
                [
                    OrderStatus.COMPLETED,
                    OrderStatus.CANCELLED,
                ]
            ),
        )
        .first()
    )

    return active_order is not None


# ==========================================
# 1. CREATE TABLE
# ==========================================


@router.post("/", response_model=TableResponse, status_code=201)
def create_table(
    data: TableCreate,
    db: Session = Depends(get_db),
):

    existing_table = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.table_number == data.table_number)
        .first()
    )

    if existing_table:
        raise HTTPException(status_code=409, detail="Table number already exists.")

    new_table = RestaurantTable(
        table_number=data.table_number,
        capacity=data.capacity,
        status=TableStatus.AVAILABLE,
        is_active=True,
    )

    try:

        db.add(new_table)
        db.commit()
        db.refresh(new_table)

        return new_table

    except IntegrityError:

        db.rollback()

        raise HTTPException(status_code=409, detail="Table number already exists.")


# ==========================================
# 2. GET ALL TABLES
# ==========================================


@router.get("/", response_model=list[TableResponse])
def get_all_tables(
    db: Session = Depends(get_db),
):

    tables = db.query(RestaurantTable).order_by(RestaurantTable.id.asc()).all()
    updated = False

    for table in tables:
        has_active = has_active_orders(db, table.id)
        if has_active and table.status != TableStatus.OCCUPIED:
            table.status = TableStatus.OCCUPIED
            updated = True

    if updated:
        db.commit()

    return tables


# ==========================================
# 3. GET SINGLE TABLE
# ==========================================


@router.get("/{table_id}", response_model=TableResponse)
def get_table(
    table_id: int,
    db: Session = Depends(get_db),
):

    table = get_table_record(db, table_id)
    has_active = has_active_orders(db, table.id)

    if has_active and table.status != TableStatus.OCCUPIED:
        table.status = TableStatus.OCCUPIED
        db.commit()
        db.refresh(table)

    return table


# ==========================================
# 4. UPDATE TABLE
# ==========================================


@router.patch("/{table_id}", response_model=TableResponse)
def update_table(
    table_id: int,
    data: TableUpdate,
    db: Session = Depends(get_db),
):

    table = get_table_record(db, table_id)

    updates = data.model_dump(exclude_unset=True)

    # Check duplicate table number
    if "table_number" in updates:

        existing_table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.table_number == updates["table_number"],
                RestaurantTable.id != table_id,
            )
            .first()
        )

        if existing_table:
            raise HTTPException(status_code=409, detail="Table number already exists.")

    # Prevent manual status override if active orders exist
    if "status" in updates:
        if updates["status"] == TableStatus.AVAILABLE and has_active_orders(db, table_id):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot set table to Available because active orders are "
                    "currently associated with it."
                ),
            )

    # Prevent deactivating a table with active orders
    if updates.get("is_active") is False:

        if has_active_orders(db, table_id):

            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot deactivate this table because "
                    "active orders are associated with it."
                ),
            )

    try:

        for field, value in updates.items():
            setattr(table, field, value)

        db.commit()
        db.refresh(table)

        return table

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409, detail="Table update conflicts with existing information."
        )


# ==========================================
# 5. DELETE TABLE
# ==========================================


@router.delete("/{table_id}")
def delete_table(
    table_id: int,
    db: Session = Depends(get_db),
):

    table = get_table_record(db, table_id)

    # Preserve historical order records
    existing_order = db.query(Order.id).filter(Order.table_id == table_id).first()

    if existing_order:

        raise HTTPException(
            status_code=409,
            detail=(
                "This table is associated with existing orders "
                "and cannot be deleted. Deactivate it instead."
            ),
        )

    db.delete(table)
    db.commit()

    return {"message": "Restaurant table deleted successfully."}
