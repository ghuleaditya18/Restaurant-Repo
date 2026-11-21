from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import IntegrityError

from app.core.date_utils import get_date_range, get_kolkata_now

from app.db.session import get_db
from app.services.order_service import cancel_stale_orders
from app.services.inventory_service import (
    deduct_inventory_for_order,
    reverse_order_inventory_deduction,
)
from app.models.entities import (
    User,
    Customer,
    RestaurantTable,
    MenuCategory,
    MenuItem,
    Order,
    OrderItem,
    OrderStatusHistory,
    OrderStatus,
    TableStatus,
    PaymentStatus,
)
from app.api.deps import require_roles, get_current_user, require_restaurant_context
from app.schemas.order import (
    OrderCreate,
    OrderUpdate,
    OrderItemCreate,
    OrderItemUpdate,
    OrderStatusUpdate,
    OrderResponse,
    OrderItemResponse,
    OrderStatusHistoryResponse,
)

# ==========================================
# ROUTER CONFIGURATION
# ==========================================

router = APIRouter(
    tags=["Order Management"],
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)


TERMINAL_STATUSES = {
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
}

EDITABLE_STATUSES = {
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
}

ALLOWED_TRANSITIONS = {
    OrderStatus.PENDING: {
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PREPARING: {
        OrderStatus.READY,
        OrderStatus.SERVED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.READY: {
        OrderStatus.SERVED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.SERVED: {
        OrderStatus.COMPLETED,
    },
}


# ==========================================
# COMMON HELPER FUNCTIONS
# ==========================================


def get_order_record(db: Session, order_id: int):
    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.table),
            joinedload(Order.invoice),
            selectinload(Order.items),
            selectinload(Order.status_history),
        )
        .filter(Order.id == order_id)
        .first()
    )

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    return order


def build_order_response(order):
    subtotal = sum(
        (item.line_total for item in order.items),
        Decimal("0.00"),
    )

    invoice_id = order.invoice.id if order.invoice else None
    invoice_number = order.invoice.invoice_number if order.invoice else None
    payment_status = order.invoice.payment_status if order.invoice else None

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=order.customer.full_name,
        table_id=order.table_id,
        table_number=order.table.table_number,
        created_by_user_id=order.created_by_user_id,
        status=order.status,
        special_instructions=order.special_instructions,
        items=[OrderItemResponse.model_validate(item) for item in order.items],
        status_history=[
            OrderStatusHistoryResponse.model_validate(history)
            for history in sorted(
                order.status_history,
                key=lambda record: record.changed_at,
            )
        ],
        subtotal=subtotal,
        created_at=order.created_at,
        invoice_id=invoice_id,
        invoice_number=invoice_number,
        payment_status=payment_status,
    )


def get_available_menu_item(db: Session, menu_item_id: int):
    item = (
        db.query(MenuItem)
        .options(joinedload(MenuItem.category))
        .filter(MenuItem.id == menu_item_id)
        .first()
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    if not item.is_available:
        raise HTTPException(
            status_code=400,
            detail=f"{item.name} is currently unavailable.",
        )

    if not item.category.is_active:
        raise HTTPException(
            status_code=400,
            detail="This menu item's category is inactive.",
        )

    return item


def ensure_editable_order(order):
    if order.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Order items can only be modified "
                "while the order is Pending or Confirmed."
            ),
        )


def refresh_table_status(db: Session, table_id: int):
    db.flush()

    today_start, today_end = get_date_range("today")
    query = (
        db.query(Order.id)
        .filter(
            Order.table_id == table_id,
            Order.status.notin_(list(TERMINAL_STATUSES)),
        )
    )
    if today_start is not None and today_end is not None:
        query = query.filter(
            Order.created_at >= today_start,
            Order.created_at <= today_end,
        )

    active_order = query.first()

    table = db.query(RestaurantTable).filter(RestaurantTable.id == table_id).first()

    if table:
        expected_status = (
            TableStatus.OCCUPIED if active_order else TableStatus.AVAILABLE
        )
        if table.status != expected_status:
            table.status = expected_status


# ==========================================
# 1. CREATE ORDER
# ==========================================


@router.post("/", response_model=OrderResponse, status_code=201)
def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == data.customer_id).first()

    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")

    table = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.id == data.table_id)
        .with_for_update()
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=404,
            detail="Restaurant table not found.",
        )

    if not table.is_active:
        raise HTTPException(
            status_code=400,
            detail="This restaurant table is inactive.",
        )

    # Multiple orders are allowed on an occupied table.

    try:
        new_order = Order(
            customer_id=data.customer_id,
            table_id=data.table_id,
            created_by_user_id=current_user.id,
            status=OrderStatus.PENDING,
            special_instructions=data.special_instructions,
        )

        db.add(new_order)
        db.flush()

        for requested_item in data.items:
            menu_item = get_available_menu_item(
                db,
                requested_item.menu_item_id,
            )

            quantity = requested_item.quantity
            line_total = menu_item.price * quantity

            order_item = OrderItem(
                order_id=new_order.id,
                menu_item_id=menu_item.id,
                item_name=menu_item.name,
                quantity=quantity,
                unit_price=menu_item.price,
                line_total=line_total,
            )

            db.add(order_item)

        # Record initial status history.
        db.add(
            OrderStatusHistory(
                order_id=new_order.id,
                previous_status=None,
                new_status=OrderStatus.PENDING,
                changed_by_user_id=current_user.id,
                note="Order created.",
            )
        )

        table.status = TableStatus.OCCUPIED

        db.commit()

        order = get_order_record(db, new_order.id)
        return build_order_response(order)

    except Exception:
        db.rollback()
        raise


# ==========================================
# 2. GET ALL ORDERS
# ==========================================


@router.get("/", response_model=list[OrderResponse])
def get_all_orders(
    status: OrderStatus | None = None,
    table_id: int | None = None,
    customer_id: int | None = None,
    view: str | None = None,
    preset: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    # Automatically evaluate and cancel stale orders exceeding inactivity timeout
    cancel_stale_orders(db)

    query = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.table),
        joinedload(Order.invoice),
        selectinload(Order.items),
        selectinload(Order.status_history),
    )

    if view == "active":
        query = query.filter(Order.status.notin_(TERMINAL_STATUSES))
    elif view == "history":
        query = query.filter(Order.status.in_(TERMINAL_STATUSES))

    if status is not None:
        query = query.filter(Order.status == status)

    if table_id is not None:
        query = query.filter(Order.table_id == table_id)

    if customer_id is not None:
        query = query.filter(Order.customer_id == customer_id)

    start_dt, end_dt = get_date_range(preset, start_date, end_date)
    if start_dt is not None and end_dt is not None:
        query = query.filter(Order.created_at >= start_dt, Order.created_at <= end_dt)

    orders = query.order_by(Order.id.desc()).all()

    return [build_order_response(order) for order in orders]


# ==========================================
# ORDER CREATION LOOKUP APIs
# STAFF READ-ONLY ACCESS
# ==========================================


@router.get("/lookups/customers")
def get_order_customers(
    db: Session = Depends(get_db),
):
    customers = db.query(Customer).order_by(Customer.full_name.asc()).all()

    return [
        {
            "id": customer.id,
            "full_name": customer.full_name,
            "phone": customer.phone,
        }
        for customer in customers
    ]


@router.get("/lookups/tables")
def get_order_tables(
    db: Session = Depends(get_db),
):
    tables = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.is_active.is_(True))
        .order_by(RestaurantTable.table_number.asc())
        .all()
    )

    today_start, today_end = get_date_range("today")

    updated = False
    for table in tables:
        query = (
            db.query(Order.id)
            .filter(
                Order.table_id == table.id,
                Order.status.notin_(list(TERMINAL_STATUSES)),
            )
        )
        if today_start is not None and today_end is not None:
            query = query.filter(
                Order.created_at >= today_start,
                Order.created_at <= today_end,
            )
        active_order = query.first()

        expected_status = (
            TableStatus.OCCUPIED if active_order else TableStatus.AVAILABLE
        )
        if table.status != expected_status:
            table.status = expected_status
            updated = True

    if updated:
        db.commit()

    return [
        {
            "id": table.id,
            "table_number": table.table_number,
            "status": table.status,
        }
        for table in tables
    ]


@router.get("/lookups/menu-items")
def get_order_menu_items(
    db: Session = Depends(get_db),
):
    menu_items = (
        db.query(MenuItem)
        .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
        .filter(
            MenuItem.is_available.is_(True),
            MenuCategory.is_active.is_(True),
        )
        .order_by(MenuItem.name.asc())
        .all()
    )

    return [
        {
            "id": item.id,
            "name": item.name,
            "price": item.price,
            "category_id": item.category_id,
        }
        for item in menu_items
    ]


# ==========================================
# 3. GET SINGLE ORDER
# ==========================================


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
):
    order = get_order_record(db, order_id)
    return build_order_response(order)


# ==========================================
# 4. UPDATE ORDER INSTRUCTIONS
# ==========================================


@router.patch("/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: int,
    data: OrderUpdate,
    db: Session = Depends(get_db),
):
    order = get_order_record(db, order_id)
    ensure_editable_order(order)

    updates = data.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(order, field, value)

    try:
        db.commit()
        order = get_order_record(db, order_id)
        return build_order_response(order)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Order update could not be completed.",
        )


# ==========================================
# 5. ADD ITEM TO EXISTING ORDER
# ==========================================


@router.post("/{order_id}/items/", response_model=OrderResponse)
def add_order_item(
    order_id: int,
    data: OrderItemCreate,
    db: Session = Depends(get_db),
):
    order = get_order_record(db, order_id)
    ensure_editable_order(order)

    try:
        menu_item = get_available_menu_item(db, data.menu_item_id)

        existing_item = next(
            (item for item in order.items if item.menu_item_id == menu_item.id),
            None,
        )

        if existing_item:
            existing_item.quantity += data.quantity
            existing_item.line_total = existing_item.unit_price * existing_item.quantity
        else:
            db.add(
                OrderItem(
                    order_id=order.id,
                    menu_item_id=menu_item.id,
                    item_name=menu_item.name,
                    quantity=data.quantity,
                    unit_price=menu_item.price,
                    line_total=menu_item.price * data.quantity,
                )
            )

        db.commit()

        return build_order_response(get_order_record(db, order_id))

    except Exception:
        db.rollback()
        raise


# ==========================================
# 6. UPDATE ORDER ITEM QUANTITY
# ==========================================


@router.patch(
    "/{order_id}/items/{order_item_id}",
    response_model=OrderResponse,
)
def update_order_item(
    order_id: int,
    order_item_id: int,
    data: OrderItemUpdate,
    db: Session = Depends(get_db),
):
    order = get_order_record(db, order_id)
    ensure_editable_order(order)

    order_item = next(
        (item for item in order.items if item.id == order_item_id),
        None,
    )

    if order_item is None:
        raise HTTPException(
            status_code=404,
            detail="Order item not found.",
        )

    order_item.quantity = data.quantity
    order_item.line_total = order_item.unit_price * data.quantity

    db.commit()

    return build_order_response(get_order_record(db, order_id))


# ==========================================
# 7. REMOVE ITEM FROM ORDER
# ==========================================


@router.delete(
    "/{order_id}/items/{order_item_id}",
    response_model=OrderResponse,
)
def remove_order_item(
    order_id: int,
    order_item_id: int,
    db: Session = Depends(get_db),
):
    order = get_order_record(db, order_id)
    ensure_editable_order(order)

    order_item = next(
        (item for item in order.items if item.id == order_item_id),
        None,
    )

    if order_item is None:
        raise HTTPException(
            status_code=404,
            detail="Order item not found.",
        )

    if len(order.items) <= 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "An order must contain at least one item. " "Cancel the order instead."
            ),
        )

    db.delete(order_item)
    db.commit()

    return build_order_response(get_order_record(db, order_id))


# ==========================================
# 8. UPDATE ORDER STATUS
# ==========================================


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = get_order_record(db, order_id)

    if data.status == order.status:
        raise HTTPException(
            status_code=400,
            detail="Order already has this status.",
        )

    allowed_statuses = ALLOWED_TRANSITIONS.get(order.status, set())

    if data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot change order status from "
                f"{order.status.value} to {data.status.value}."
            ),
        )

    if data.status == OrderStatus.COMPLETED:
        if order.invoice is None:
            raise HTTPException(
                status_code=400,
                detail="Generate the invoice before completing the order.",
            )
        if order.invoice.payment_status != PaymentStatus.PAID:
            raise HTTPException(
                status_code=400,
                detail="Invoice must be paid before completing the order.",
            )

    previous_status = order.status

    try:
        # Trigger atomic stock deduction when transitioning to PREPARING
        if data.status == OrderStatus.PREPARING:
            deduct_inventory_for_order(db=db, order=order, user_id=current_user.id)

        # Trigger atomic stock restoration if cancelling an order that reached PREPARING or beyond
        if data.status == OrderStatus.CANCELLED and previous_status in {
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.SERVED,
        }:
            reverse_order_inventory_deduction(db=db, order=order, user_id=current_user.id)

        order.status = data.status

        db.add(
            OrderStatusHistory(
                order_id=order.id,
                previous_status=previous_status,
                new_status=data.status,
                changed_by_user_id=current_user.id,
                note=data.note,
                changed_at=get_kolkata_now(),
            )
        )

        if data.status in TERMINAL_STATUSES:
            refresh_table_status(db, order.table_id)
        else:
            order.table.status = TableStatus.OCCUPIED

        db.commit()

        return build_order_response(get_order_record(db, order_id))

    except Exception:
        db.rollback()
        raise
