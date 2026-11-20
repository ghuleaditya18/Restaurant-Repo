from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_roles
from app.core.date_utils import get_date_range
from app.db.session import get_db
from app.services.order_service import cancel_stale_orders
from app.models.entities import (
    Customer,
    Invoice,
    MenuItem,
    Order,
    OrderStatus,
    Payment,
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
    dependencies=[Depends(require_roles("MANAGER"))],
)


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    preset: str = Query(default="today"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    # Automatically evaluate and cancel stale orders exceeding inactivity timeout
    cancel_stale_orders(db)

    start_dt, end_dt = get_date_range(preset=preset, start_date=start_date, end_date=end_date)

    # Date-filtered orders query
    filtered_orders = db.query(Order)
    if start_dt is not None and end_dt is not None:
        filtered_orders = filtered_orders.filter(
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
        )

    total_orders = filtered_orders.with_entities(func.count(Order.id)).scalar() or 0

    pending_orders = (
        filtered_orders.filter(Order.status == OrderStatus.PENDING)
        .with_entities(func.count(Order.id))
        .scalar()
        or 0
    )
    preparing_orders = (
        filtered_orders.filter(Order.status == OrderStatus.PREPARING)
        .with_entities(func.count(Order.id))
        .scalar()
        or 0
    )
    completed_orders = (
        filtered_orders.filter(Order.status == OrderStatus.COMPLETED)
        .with_entities(func.count(Order.id))
        .scalar()
        or 0
    )
    active_orders = (
        filtered_orders.filter(
            Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED])
        )
        .with_entities(func.count(Order.id))
        .scalar()
        or 0
    )

    # Permanent catalog counts (unaffected by date filter)
    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    total_staff = db.query(func.count(Staff.id)).scalar() or 0
    total_menu_items = db.query(func.count(MenuItem.id)).scalar() or 0

    # Today's date range in Asia/Kolkata for today_orders reference counter
    today_start, today_end = get_date_range(preset="today")
    today_orders = (
        db.query(func.count(Order.id))
        .filter(Order.created_at >= today_start, Order.created_at <= today_end)
        .scalar()
        or 0
    )

    # Date-filtered invoice and payment statistics
    invoice_q = db.query(Invoice)
    if start_dt is not None and end_dt is not None:
        invoice_q = invoice_q.filter(
            Invoice.created_at >= start_dt,
            Invoice.created_at <= end_dt,
        )
    pending_payments = (
        invoice_q.filter(Invoice.payment_status == PaymentStatus.PENDING)
        .with_entities(func.count(Invoice.id))
        .scalar()
        or 0
    )

    payment_q = db.query(Payment).filter(Payment.status == PaymentStatus.PAID)
    if start_dt is not None and end_dt is not None:
        payment_q = payment_q.filter(
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
    total_revenue = (
        payment_q.with_entities(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .scalar()
        or Decimal("0.00")
    )

    # Active tables and current orders count per table for current business date (Asia/Kolkata)
    active_tables = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.is_active.is_(True))
        .order_by(RestaurantTable.table_number.asc(), RestaurantTable.id.asc())
        .all()
    )

    active_order_query = db.query(Order.table_id, func.count(Order.id)).filter(
        Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED])
    )
    if today_start is not None and today_end is not None:
        active_order_query = active_order_query.filter(
            Order.created_at >= today_start,
            Order.created_at <= today_end,
        )

    active_order_counts = dict(
        active_order_query.group_by(Order.table_id).all()
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

    preset_label = preset.capitalize() if preset else "Today"
    if preset == "last_7_days":
        preset_label = "Last 7 Days"
    elif preset == "this_month":
        preset_label = "This Month"
    elif preset == "all":
        preset_label = "All Dates"
    elif preset == "custom":
        preset_label = f"{start_date} to {end_date}" if start_date and end_date else "Custom"

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
        total_revenue=total_revenue,
        date_filter_label=preset_label,
    )

    # 10 latest orders for selected date range
    recent_query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.table),
            selectinload(Order.items),
        )
    )
    if start_dt is not None and end_dt is not None:
        recent_query = recent_query.filter(
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
        )
    recent_orders_query = (
        recent_query.order_by(Order.created_at.desc(), Order.id.desc())
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
