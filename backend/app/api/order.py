import math
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func

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
    PaymentMethod,
    Invoice,
    Payment,
)
from app.models.inventory import StockMovement
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
    OrderPaymentCreate,
    BulkArchiveRequest,
    BulkArchiveResponse,
    PaginatedOrdersResponse,
    CheckArchiveDeletionRequest,
    CheckArchiveDeletionResponse,
    ProtectedOrderDetail,
    BulkDeleteArchivedOrdersRequest,
    BulkDeleteArchivedOrdersResponse,
    BulkRestoreOrdersRequest,
    BulkRestoreOrdersResponse,
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
        OrderStatus.READY,
        OrderStatus.PREPARING,  # legacy compatibility
        OrderStatus.CANCELLED,
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.READY,
        OrderStatus.PREPARING,  # legacy compatibility
        OrderStatus.CANCELLED,
    },
    OrderStatus.PREPARING: {  # legacy compatibility
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
            joinedload(Order.invoice).selectinload(Invoice.payments),
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

    if order.invoice:
        tax_amount = order.invoice.gst_amount
        total_amount = order.invoice.total_amount
        payments_list = [
            {
                "id": p.id,
                "payment_method": getattr(p.payment_method, "value", str(p.payment_method)),
                "amount": p.amount,
                "status": getattr(p.status, "value", str(p.status)),
                "reference_number": p.reference_number,
                "paid_at": p.paid_at,
            }
            for p in (order.invoice.payments or [])
        ]
        amount_paid = sum(
            (
                p.amount
                for p in (order.invoice.payments or [])
                if (
                    p.status == PaymentStatus.PAID
                    or str(getattr(p.status, "value", p.status)).upper() == "PAID"
                )
            ),
            Decimal("0.00"),
        )
        outstanding_balance = max(Decimal("0.00"), total_amount - amount_paid)
    else:
        tax_amount = (subtotal * Decimal("5.00") / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        total_amount = subtotal + tax_amount
        payments_list = []
        amount_paid = Decimal("0.00")
        outstanding_balance = total_amount

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=order.customer.full_name if order.customer else "Guest",
        table_id=order.table_id,
        table_number=order.table.table_number if order.table else "N/A",
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
        tax_amount=tax_amount,
        total_amount=total_amount,
        amount_paid=amount_paid,
        outstanding_balance=outstanding_balance,
        payments=payments_list,
        archived_at=order.archived_at,
        archived_by=order.archived_by,
        archive_reason=order.archive_reason,
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


@router.get("/")
def get_all_orders(
    status: OrderStatus | None = None,
    table_id: int | None = None,
    customer_id: int | None = None,
    view: str | None = None,
    tab: str | None = None,
    preset: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    sort_by: str | None = "newest",
    page: int | None = None,
    page_size: int = 10,
    paginate: bool = False,
    db: Session = Depends(get_db),
):
    # Automatically evaluate and cancel stale orders exceeding inactivity timeout
    cancel_stale_orders(db)

    today_start, today_end = get_date_range("today")

    # Summary counts across non-archived orders for the lifecycle badges
    summary_counts = {
        "all_active": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status.notin_(TERMINAL_STATUSES))
            .scalar()
            or 0
        ),
        "recent_today": (
            db.query(func.count(Order.id))
            .filter(
                Order.archived_at.is_(None),
                Order.created_at >= today_start,
                Order.created_at <= today_end,
            )
            .scalar()
            or 0
        ) if today_start and today_end else 0,
        "history": (
            db.query(func.count(Order.id))
            .filter(
                Order.archived_at.is_(None),
                Order.created_at < today_start,
            )
            .scalar()
            or 0
        ) if today_start else (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status.in_(TERMINAL_STATUSES))
            .scalar()
            or 0
        ),
        "ordered": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status == OrderStatus.PENDING)
            .scalar()
            or 0
        ),
        "confirmed": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status == OrderStatus.CONFIRMED)
            .scalar()
            or 0
        ),
        "ready": (
            db.query(func.count(Order.id))
            .filter(
                Order.archived_at.is_(None),
                Order.status.in_([OrderStatus.READY, OrderStatus.PREPARING]),
            )
            .scalar()
            or 0
        ),
        "served": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status == OrderStatus.SERVED)
            .scalar()
            or 0
        ),
        "completed": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status == OrderStatus.COMPLETED)
            .scalar()
            or 0
        ),
        "cancelled": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.is_(None), Order.status == OrderStatus.CANCELLED)
            .scalar()
            or 0
        ),
        "archived": (
            db.query(func.count(Order.id))
            .filter(Order.archived_at.isnot(None))
            .scalar()
            or 0
        ),
    }

    query = (
        db.query(Order)
        .join(Customer, Order.customer_id == Customer.id)
        .join(RestaurantTable, Order.table_id == RestaurantTable.id)
        .outerjoin(Invoice, Order.id == Invoice.order_id)
        .options(
            joinedload(Order.customer),
            joinedload(Order.table),
            joinedload(Order.invoice).selectinload(Invoice.payments),
            selectinload(Order.items),
            selectinload(Order.status_history),
        )
    )

    effective_tab = tab or view or "active"

    if effective_tab == "archived":
        query = query.filter(Order.archived_at.isnot(None))
    else:
        query = query.filter(Order.archived_at.is_(None))
        if effective_tab == "active":
            query = query.filter(Order.status.notin_(TERMINAL_STATUSES))
        elif effective_tab in ("today", "recent_today", "recent"):
            if today_start is not None and today_end is not None:
                query = query.filter(Order.created_at >= today_start, Order.created_at <= today_end)
        elif effective_tab == "history":
            if today_start is not None:
                query = query.filter(Order.created_at < today_start)
            else:
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

    if payment_status:
        norm_ps = payment_status.strip().upper()
        if norm_ps in ("PAID",):
            query = query.filter(Invoice.payment_status == PaymentStatus.PAID)
        elif norm_ps in ("PARTIALLY_PAID", "PARTIAL", "PARTIALLY PAID"):
            query = query.filter(Invoice.payment_status == PaymentStatus.PARTIALLY_PAID)
        elif norm_ps in ("PENDING", "UNPAID"):
            query = query.filter(
                or_(
                    Invoice.id.is_(None),
                    Invoice.payment_status == PaymentStatus.PENDING,
                )
            )

    if payment_method:
        query = query.join(Payment, Invoice.id == Payment.invoice_id).filter(
            Payment.payment_method == payment_method
        )

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_number.ilike(term),
                Customer.full_name.ilike(term),
                Customer.phone.ilike(term),
                RestaurantTable.table_number.ilike(term),
                Order.items.any(OrderItem.item_name.ilike(term)),
            )
        )

    if sort_by == "oldest":
        query = query.order_by(Order.id.asc())
    elif sort_by == "highest_amount":
        query = query.order_by(func.coalesce(Invoice.total_amount, 0).desc(), Order.id.desc())
    elif sort_by == "lowest_amount":
        query = query.order_by(func.coalesce(Invoice.total_amount, 0).asc(), Order.id.desc())
    else:
        query = query.order_by(Order.id.desc())

    if page is not None or paginate:
        cur_page = max(1, page or 1)
        p_size = max(1, page_size)
        total = query.count()
        total_pages = max(1, math.ceil(total / p_size))
        items = query.offset((cur_page - 1) * p_size).limit(p_size).all()
        order_responses = [build_order_response(order) for order in items]

        return {
            "items": order_responses,
            "total": total,
            "page": cur_page,
            "page_size": p_size,
            "total_pages": total_pages,
            "summary_counts": summary_counts,
        }

    orders = query.all()
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
        # If no invoice exists, auto-generate invoice
        if order.invoice is None:
            subtotal = sum((item.line_total for item in order.items), Decimal("0.00"))
            gst_rate = Decimal("5.00")
            gst_amount = (subtotal * gst_rate / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            total_amount = subtotal + gst_amount
            order.invoice = Invoice(
                order_id=order.id,
                subtotal=subtotal,
                gst_rate=gst_rate,
                gst_amount=gst_amount,
                total_amount=total_amount,
                payment_status=PaymentStatus.PENDING,
            )
            db.add(order.invoice)
            db.flush()

        amount_paid = sum(
            (
                p.amount
                for p in (order.invoice.payments or [])
                if (
                    p.status == PaymentStatus.PAID
                    or str(getattr(p.status, "value", p.status)).upper() == "PAID"
                )
            ),
            Decimal("0.00"),
        )
        if amount_paid < order.invoice.total_amount and order.invoice.total_amount > Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot complete order with an outstanding balance of ₹{order.invoice.total_amount - amount_paid:.2f}. "
                    "Invoice must be paid in full before completion."
                ),
            )
        order.invoice.payment_status = PaymentStatus.PAID

    previous_status = order.status

    try:
        # Trigger atomic stock deduction when transitioning to READY or PREPARING
        if data.status in {OrderStatus.READY, OrderStatus.PREPARING}:
            deduct_inventory_for_order(db=db, order=order, user_id=current_user.id)

        # Trigger atomic stock restoration if cancelling an order that reached READY, PREPARING, or SERVED
        if data.status == OrderStatus.CANCELLED and previous_status in {
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.SERVED,
        }:
            reverse_order_inventory_deduction(db=db, order=order, user_id=current_user.id)

        order.status = data.status

        # Clean normalized transition note
        display_from = "Ordered" if previous_status == OrderStatus.PENDING else previous_status.value
        display_to = "Ordered" if data.status == OrderStatus.PENDING else data.status.value
        clean_note = (
            data.note
            if (data.note and "→" not in data.note)
            else f"{display_from} → {display_to}"
        )

        db.add(
            OrderStatusHistory(
                order_id=order.id,
                previous_status=previous_status,
                new_status=data.status,
                changed_by_user_id=current_user.id,
                note=clean_note,
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


# ==========================================
# 9. RECORD PAYMENT DIRECTLY FROM ORDER
# ==========================================


@router.post("/{order_id}/payments", response_model=OrderResponse)
def record_order_payment(
    order_id: int,
    data: OrderPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = get_order_record(db, order_id)

    if order.status != OrderStatus.SERVED:
        raise HTTPException(
            status_code=400,
            detail=f"Payments can only be collected for orders in Served status (current: {order.status.value}).",
        )

    if data.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

    # Auto-create invoice if missing
    if order.invoice is None:
        subtotal = sum((item.line_total for item in order.items), Decimal("0.00"))
        gst_rate = Decimal("5.00")
        gst_amount = (subtotal * gst_rate / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        total_amount = subtotal + gst_amount
        invoice = Invoice(
            order_id=order.id,
            subtotal=subtotal,
            gst_rate=gst_rate,
            gst_amount=gst_amount,
            total_amount=total_amount,
            payment_status=PaymentStatus.PENDING,
        )
        db.add(invoice)
        db.flush()
        order.invoice = invoice

    invoice = order.invoice
    amount_paid_so_far = sum(
        (
            p.amount
            for p in (invoice.payments or [])
            if (
                p.status == PaymentStatus.PAID
                or str(getattr(p.status, "value", p.status)).upper() == "PAID"
            )
        ),
        Decimal("0.00"),
    )
    outstanding = max(Decimal("0.00"), invoice.total_amount - amount_paid_so_far)

    if outstanding <= Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail="This order is already fully paid.",
        )

    if data.amount > outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount (₹{data.amount:.2f}) cannot exceed the outstanding balance (₹{outstanding:.2f}).",
        )

    now = get_kolkata_now()
    new_payment = Payment(
        invoice_id=invoice.id,
        payment_method=data.payment_method,
        amount=data.amount,
        status=PaymentStatus.PAID,
        paid_at=now,
        reference_number=data.reference_number,
    )
    db.add(new_payment)
    db.flush()

    new_total_paid = amount_paid_so_far + data.amount
    new_outstanding = max(Decimal("0.00"), invoice.total_amount - new_total_paid)

    # If fully settled:
    if new_outstanding == Decimal("0.00"):
        invoice.payment_status = PaymentStatus.PAID
        previous_status = order.status
        order.status = OrderStatus.COMPLETED

        db.add(
            OrderStatusHistory(
                order_id=order.id,
                previous_status=previous_status,
                new_status=OrderStatus.COMPLETED,
                changed_by_user_id=current_user.id,
                note=f"Full payment of ₹{data.amount:.2f} received via {data.payment_method.value}. Order completed automatically.",
                changed_at=now,
            )
        )
        refresh_table_status(db, order.table_id)
    else:
        invoice.payment_status = PaymentStatus.PARTIALLY_PAID
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                previous_status=order.status,
                new_status=order.status,
                changed_by_user_id=current_user.id,
                note=f"Partial payment of ₹{data.amount:.2f} received via {data.payment_method.value}. Remaining balance: ₹{new_outstanding:.2f}.",
                changed_at=now,
            )
        )

    try:
        db.commit()
        return build_order_response(get_order_record(db, order_id))
    except Exception:
        db.rollback()
        raise


# ==========================================
# 10. BULK ARCHIVE ORDERS (CLEAR OLD ORDERS)
# ==========================================


@router.post("/bulk-archive", response_model=BulkArchiveResponse)
def bulk_archive_orders(
    data: BulkArchiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Only managers or administrators are authorized to clear orders.",
        )

    now = get_kolkata_now()
    days = max(1, data.older_than_days)
    cutoff = now - timedelta(days=days)

    query = (
        db.query(Order)
        .options(
            joinedload(Order.invoice).selectinload(Invoice.payments),
        )
        .filter(Order.archived_at.is_(None))
    )

    if data.order_ids is not None:
        query = query.filter(Order.id.in_(data.order_ids))
    else:
        query = query.filter(Order.created_at <= cutoff)

    orders = query.all()

    archived_ids = []
    excluded_details = []

    for order in orders:
        # Rule 1: Active orders must NEVER be cleared
        if order.status not in TERMINAL_STATUSES:
            excluded_details.append({
                "order_id": order.id,
                "order_number": order.order_number,
                "reason": f"Active order in '{order.status.value}' stage cannot be cleared.",
            })
            continue

        # Rule 2: Must be older than retention days
        order_time = order.created_at
        if order_time > cutoff:
            excluded_details.append({
                "order_id": order.id,
                "order_number": order.order_number,
                "reason": f"Order is from the last {days} days (retention rule requires older than {days} days).",
            })
            continue

        # Rule 3: If COMPLETED, must be fully settled financially
        if order.status == OrderStatus.COMPLETED and order.invoice:
            paid = sum(
                (
                    p.amount
                    for p in (order.invoice.payments or [])
                    if (
                        p.status == PaymentStatus.PAID
                        or str(getattr(p.status, "value", p.status)).upper() == "PAID"
                    )
                ),
                Decimal("0.00"),
            )
            if paid < order.invoice.total_amount:
                excluded_details.append({
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "reason": f"Completed order has an unsettled financial balance of ₹{order.invoice.total_amount - paid:.2f}.",
                })
                continue

        order.archived_at = now
        order.archived_by = current_user.id
        order.archive_reason = data.reason
        archived_ids.append(order.id)

    if archived_ids:
        db.commit()

    return BulkArchiveResponse(
        archived_count=len(archived_ids),
        excluded_count=len(excluded_details),
        archived_ids=archived_ids,
        excluded_details=excluded_details,
    )


# ==========================================
# 11. RESTORE ARCHIVED ORDER
# ==========================================


@router.post("/{order_id}/restore", response_model=OrderResponse)
def restore_archived_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Only managers or administrators are authorized to restore orders.",
        )

    order = get_order_record(db, order_id)
    if not order.archived_at:
        raise HTTPException(status_code=400, detail="This order is not archived.")

    order.archived_at = None
    order.archived_by = None
    order.archive_reason = None

    db.commit()
    return build_order_response(get_order_record(db, order_id))


# ==========================================
# 12. ARCHIVED ORDER DELETION & BULK MANAGEMENT
# ==========================================


def _check_order_deletion_eligibility(order: Order, db: Session) -> tuple[bool, str]:
    """Check if an archived order can be permanently deleted without violating financial or inventory integrity."""
    if not order.archived_at:
        return False, "Order is active or not archived. Only archived orders can be considered for permanent deletion."

    # Rule 1: Protected financial dependencies
    if order.invoice:
        payment_count = len(order.invoice.payments or [])
        if payment_count > 0:
            return False, f"Contains issued invoice ({order.invoice.invoice_number}) with {payment_count} linked payment transaction(s). Financial audit records are protected."
        return False, f"Contains issued financial invoice ({order.invoice.invoice_number}). Financial audit records are protected."

    # Rule 2: Protected immutable inventory movements (BOM sale consumption, adjustments, etc.)
    stock_movements_count = (
        db.query(func.count(StockMovement.id))
        .filter(StockMovement.reference_type == "ORDER", StockMovement.reference_id == order.id)
        .scalar()
        or 0
    )
    if stock_movements_count > 0:
        return False, f"Contains {stock_movements_count} immutable inventory stock movement(s). Ledger reconciliation history must be preserved."

    return True, "Eligible for permanent deletion. No blocking financial or stock movement dependencies."


@router.post("/check-archive-deletion", response_model=CheckArchiveDeletionResponse)
def check_archive_deletion_eligibility(
    data: CheckArchiveDeletionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only managers or administrators can check deletion eligibility.")

    orders = (
        db.query(Order)
        .options(
            joinedload(Order.invoice).selectinload(Invoice.payments),
        )
        .filter(Order.id.in_(data.order_ids))
        .all()
    )

    eligible_ids = []
    protected_orders = []

    order_map = {o.id: o for o in orders}
    for oid in data.order_ids:
        order = order_map.get(oid)
        if not order:
            continue
        is_eligible, reason = _check_order_deletion_eligibility(order, db)
        if is_eligible:
            eligible_ids.append(order.id)
        else:
            protected_orders.append(
                ProtectedOrderDetail(
                    id=order.id,
                    order_number=order.order_number,
                    reason=reason,
                )
            )

    return CheckArchiveDeletionResponse(
        total_selected=len(data.order_ids),
        eligible_count=len(eligible_ids),
        protected_count=len(protected_orders),
        eligible_ids=eligible_ids,
        protected_orders=protected_orders,
    )


@router.delete("/{order_id}")
def delete_archived_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only managers or administrators are authorized to permanently delete orders.")

    order = get_order_record(db, order_id)
    is_eligible, reason = _check_order_deletion_eligibility(order, db)
    if not is_eligible:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot permanently delete Order {order.order_number}: {reason}",
        )

    # Clean dependent items and status history safely
    db.query(OrderItem).filter(OrderItem.order_id == order.id).delete(synchronize_session=False)
    db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == order.id).delete(synchronize_session=False)
    order_num = order.order_number
    db.delete(order)
    db.commit()

    return {
        "message": f"Archived Order {order_num} has been permanently deleted.",
        "deleted_id": order_id,
    }


@router.post("/bulk-delete-archived", response_model=BulkDeleteArchivedOrdersResponse)
def bulk_delete_archived_orders(
    data: BulkDeleteArchivedOrdersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only managers or administrators are authorized to delete archived orders.")

    orders = (
        db.query(Order)
        .options(
            joinedload(Order.invoice).selectinload(Invoice.payments),
        )
        .filter(Order.id.in_(data.order_ids))
        .all()
    )

    deleted_ids = []
    protected_orders = []

    for order in orders:
        is_eligible, reason = _check_order_deletion_eligibility(order, db)
        if is_eligible:
            db.query(OrderItem).filter(OrderItem.order_id == order.id).delete(synchronize_session=False)
            db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == order.id).delete(synchronize_session=False)
            deleted_ids.append(order.id)
            db.delete(order)
        else:
            protected_orders.append(
                ProtectedOrderDetail(
                    id=order.id,
                    order_number=order.order_number,
                    reason=reason,
                )
            )

    if deleted_ids:
        db.commit()

    msg = f"Successfully deleted {len(deleted_ids)} eligible archived order(s)."
    if protected_orders:
        msg += f" {len(protected_orders)} protected order(s) were preserved due to financial or stock audit records."

    return BulkDeleteArchivedOrdersResponse(
        total_requested=len(data.order_ids),
        deleted_count=len(deleted_ids),
        protected_count=len(protected_orders),
        deleted_ids=deleted_ids,
        protected_orders=protected_orders,
        message=msg,
    )


@router.post("/bulk-restore", response_model=BulkRestoreOrdersResponse)
def bulk_restore_orders(
    data: BulkRestoreOrdersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user.role, "value", current_user.role)).upper()
    if role not in ("MANAGER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only managers or administrators are authorized to restore orders.")

    orders = db.query(Order).filter(Order.id.in_(data.order_ids), Order.archived_at.isnot(None)).all()
    restored_ids = []
    for order in orders:
        order.archived_at = None
        order.archived_by = None
        order.archive_reason = None
        restored_ids.append(order.id)

    if restored_ids:
        db.commit()

    return BulkRestoreOrdersResponse(
        total_requested=len(data.order_ids),
        restored_count=len(restored_ids),
        restored_ids=restored_ids,
        message=f"Successfully restored {len(restored_ids)} order(s) to active records.",
    )
