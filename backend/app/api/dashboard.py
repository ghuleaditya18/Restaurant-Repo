from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.entities import (
    Customer,
    Invoice,
    MenuItem,
    Order,
    OrderStatus,
    PaymentStatus,
    RestaurantTable,
    Staff,
    TableStatus,
)
from app.schemas.dashboard import (
    DashboardStatistics,
    DashboardSummaryResponse,
    RecentOrderResponse,
    TableStatusSummary,
)

router = APIRouter(
    tags=["Dashboard"],
    dependencies=[Depends(require_roles("MANAGER", "STAFF"))],
)


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(get_db),
):
    total_orders = db.query(func.count(Order.id)).scalar() or 0
    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    total_staff = db.query(func.count(Staff.id)).scalar() or 0
    total_menu_items = db.query(func.count(MenuItem.id)).scalar() or 0

    pending_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status == OrderStatus.PENDING)
        .scalar()
        or 0
    )
    preparing_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status == OrderStatus.PREPARING)
        .scalar()
        or 0
    )
    completed_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status == OrderStatus.COMPLETED)
        .scalar()
        or 0
    )

    # Active tables and current orders count per table
    active_tables = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.is_active.is_(True))
        .order_by(RestaurantTable.table_number.asc(), RestaurantTable.id.asc())
        .all()
    )

    active_order_counts = dict(
        db.query(Order.table_id, func.count(Order.id))
        .filter(
            Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED])
        )
        .group_by(Order.table_id)
        .all()
    )

    # Reconcile table statuses if needed so table availability counts match reality
    table_status_changed = False
    for table in active_tables:
        has_active = active_order_counts.get(table.id, 0) > 0
        expected_status = TableStatus.OCCUPIED if has_active else TableStatus.AVAILABLE
        if table.status != expected_status:
            table.status = expected_status
            table_status_changed = True

    if table_status_changed:
        db.commit()

    total_tables = len(active_tables)
    available_tables = sum(
        1 for t in active_tables if t.status == TableStatus.AVAILABLE
    )
    occupied_tables = sum(
        1 for t in active_tables if t.status == TableStatus.OCCUPIED
    )

    today_orders = (
        db.query(func.count(Order.id))
        .filter(func.date(Order.created_at) == func.current_date())
        .scalar()
        or 0
    )
    active_orders = (
        db.query(func.count(Order.id))
        .filter(
            Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED])
        )
        .scalar()
        or 0
    )
    pending_payments = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.payment_status == PaymentStatus.PENDING)
        .scalar()
        or 0
    )

    statistics = DashboardStatistics(
        total_orders=total_orders,
        total_customers=total_customers,
        total_staff=total_staff,
        total_menu_items=total_menu_items,
        pending_orders=pending_orders,
        preparing_orders=preparing_orders,
        completed_orders=completed_orders,
        total_tables=total_tables,
        available_tables=available_tables,
        occupied_tables=occupied_tables,
        today_orders=today_orders,
        active_orders=active_orders,
        pending_payments=pending_payments,
    )

    # 10 latest orders
    recent_orders_query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.table),
            selectinload(Order.items),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(10)
        .all()
    )

    recent_orders = [
        RecentOrderResponse(
            id=order.id,
            order_number=order.order_number,
            customer_name=order.customer.full_name if order.customer else "Customer",
            table_number=order.table.table_number if order.table else "—",
            items_count=sum(item.quantity for item in order.items),
            subtotal=sum(
                (item.line_total for item in order.items), Decimal("0.00")
            ),
            status=order.status,
        )
        for order in recent_orders_query
    ]

    tables = [
        TableStatusSummary(
            id=table.id,
            number=f"Table {table.table_number}"
            if table.table_number.isdigit()
            else table.table_number,
            status=table.status,
            orders=active_order_counts.get(table.id, 0),
        )
        for table in active_tables
    ]

    return DashboardSummaryResponse(
        statistics=statistics,
        recent_orders=recent_orders,
        tables=tables,
    )
