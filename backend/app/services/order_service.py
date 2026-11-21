import asyncio
import logging
from datetime import timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.date_utils import get_kolkata_now, get_date_range
from app.db.session import SessionLocal
from app.models.entities import (
    Order,
    OrderStatus,
    OrderStatusHistory,
    RestaurantTable,
    TableStatus,
)
from app.services.inventory_service import reverse_order_inventory_deduction

logger = logging.getLogger("dineflow.order_service")

# Statuses eligible for automatic expiration due to inactivity
STALE_ELIGIBLE_STATUSES = {
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
}

# Statuses that must NEVER be auto-cancelled
EXCLUDED_STATUSES = {
    OrderStatus.SERVED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
}


def refresh_table_occupancy_for_today(db: Session, table_id: int) -> None:
    """
    Re-evaluate table occupancy based strictly on active orders for today's
    business date in Asia/Kolkata.
    """
    db.flush()
    today_start, today_end = get_date_range("today")
    query = (
        db.query(Order.id)
        .filter(
            Order.table_id == table_id,
            Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
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
        expected_status = TableStatus.OCCUPIED if active_order else TableStatus.AVAILABLE
        if table.status != expected_status:
            table.status = expected_status


def cancel_stale_orders(db: Session, timeout_hours: int | None = None) -> list[int]:
    """
    Cancels orders in Ordered (Pending, Confirmed) or In Progress (Preparing, Ready)
    that have had no meaningful update beyond the configured timeout.

    Rules:
    - Default timeout: settings.STALE_ORDER_TIMEOUT_HOURS (24 hours).
    - Served and Completed orders are NEVER auto-cancelled.
    - Idempotent and safe to run periodically.
    - Adds OrderStatusHistory entry explaining automatic cancellation.
    - Updates table occupancy if no other active orders remain today.

    Returns:
        List of order IDs that were cancelled.
    """
    hours = timeout_hours if timeout_hours is not None else settings.STALE_ORDER_TIMEOUT_HOURS
    now = get_kolkata_now()
    cutoff_time = now - timedelta(hours=hours)

    candidate_orders = (
        db.query(Order)
        .filter(
            Order.status.in_(list(STALE_ELIGIBLE_STATUSES)),
            Order.created_at <= cutoff_time,
        )
        .all()
    )

    if not candidate_orders:
        return []

    cancelled_ids: list[int] = []
    affected_tables: set[int] = set()

    for order in candidate_orders:
        # Determine the last meaningful activity timestamp:
        # Check both order.updated_at and the latest status change in history
        last_activity = order.updated_at or order.created_at

        latest_history_time = (
            db.query(func.max(OrderStatusHistory.changed_at))
            .filter(OrderStatusHistory.order_id == order.id)
            .scalar()
        )
        if latest_history_time and latest_history_time > last_activity:
            last_activity = latest_history_time

        # If there was a meaningful update within the cutoff window, skip
        if last_activity > cutoff_time:
            continue

        previous_status = order.status

        # If order had already reached Preparing or beyond, reverse the deducted stock
        if previous_status in {OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED}:
            reverse_order_inventory_deduction(
                db=db,
                order=order,
                user_id=order.created_by_user_id,
            )

        order.status = OrderStatus.CANCELLED
        order.updated_at = now

        history_entry = OrderStatusHistory(
            order_id=order.id,
            previous_status=previous_status,
            new_status=OrderStatus.CANCELLED,
            changed_by_user_id=order.created_by_user_id,
            note=f"Order automatically cancelled due to inactivity exceeding {hours} hours.",
            changed_at=now,
        )
        db.add(history_entry)

        affected_tables.add(order.table_id)
        cancelled_ids.append(order.id)

    if cancelled_ids:
        db.flush()
        for table_id in affected_tables:
            refresh_table_occupancy_for_today(db, table_id)
        db.commit()
        logger.info(
            "Auto-cancelled %d stale orders exceeding %d hours timeout: %s",
            len(cancelled_ids),
            hours,
            cancelled_ids,
        )

    return cancelled_ids


async def stale_orders_background_worker(interval_seconds: int = 300) -> None:
    """
    Background worker loop that runs periodically during the application lifecycle.
    """
    logger.info(
        "Starting stale orders background worker (polling every %ds, timeout: %dh)",
        interval_seconds,
        settings.STALE_ORDER_TIMEOUT_HOURS,
    )
    while True:
        try:
            with SessionLocal() as db:
                cancel_stale_orders(db)
        except Exception as exc:
            logger.error("Error in stale orders background worker: %s", exc, exc_info=True)

        try:
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            logger.info("Stale orders background worker stopped.")
            break
