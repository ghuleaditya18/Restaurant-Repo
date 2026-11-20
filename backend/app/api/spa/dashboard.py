from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.date_utils import get_kolkata_now
from app.db.session import get_db
from app.api.deps import require_spa_context
from app.models.entities import User
from app.models.spa import (
    SpaBooking,
    SpaBookingStatus,
    SpaCustomer,
    SpaService,
    SpaStaff,
    SpaStaffAvailability,
    SpaInvoice,
    SpaPayment,
    SpaPaymentStatus,
)
from app.schemas.spa import (
    SpaDashboardSummaryResponse,
    SpaBookingResponse,
)
from app.api.spa.bookings import build_booking_response

router = APIRouter(dependencies=[Depends(require_spa_context)])


@router.get("/dashboard/summary", response_model=SpaDashboardSummaryResponse)
def get_spa_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_spa_context),
):
    now = get_kolkata_now()
    today_date = now.date()
    current_time = now.time()
    day_of_week = today_date.weekday()

    # 1. Today's Bookings
    today_bookings = (
        db.query(SpaBooking)
        .options(
            joinedload(SpaBooking.customer),
            joinedload(SpaBooking.therapist),
            joinedload(SpaBooking.booking_services),
            joinedload(SpaBooking.status_history),
            joinedload(SpaBooking.invoice),
        )
        .filter(SpaBooking.booking_date == today_date)
        .order_by(SpaBooking.start_time.asc())
        .all()
    )

    total_today = len(today_bookings)
    completed_today = sum(1 for b in today_bookings if b.status == SpaBookingStatus.COMPLETED.value)
    cancelled_today = sum(1 for b in today_bookings if b.status in [SpaBookingStatus.CANCELLED.value, SpaBookingStatus.NO_SHOW.value])
    in_progress = sum(1 for b in today_bookings if b.status == SpaBookingStatus.IN_PROGRESS.value)

    # 2. Upcoming bookings (today future or future dates)
    upcoming_today = sum(
        1 for b in today_bookings
        if b.status in [SpaBookingStatus.BOOKED.value, SpaBookingStatus.PENDING.value, SpaBookingStatus.CONFIRMED.value]
    )
    future_date_bookings = (
        db.query(func.count(SpaBooking.id))
        .filter(
            SpaBooking.booking_date > today_date,
            SpaBooking.status.notin_([SpaBookingStatus.CANCELLED.value, SpaBookingStatus.NO_SHOW.value])
        )
        .scalar() or 0
    )
    total_upcoming = upcoming_today + future_date_bookings

    # 3. Total customers & active services
    total_customers = db.query(func.count(SpaCustomer.id)).scalar() or 0
    active_services = db.query(func.count(SpaService.id)).filter(SpaService.is_available.is_(True)).scalar() or 0

    # 4. Therapists availability
    total_therapists = (
        db.query(func.count(SpaStaff.id))
        .filter(SpaStaff.is_therapist.is_(True), SpaStaff.is_active.is_(True))
        .scalar() or 0
    )

    # Find therapists currently busy in an in-progress or active overlapping booking right now
    busy_therapist_ids = set(
        b.staff_id for b in today_bookings
        if b.status in [SpaBookingStatus.IN_PROGRESS.value, SpaBookingStatus.CHECKED_IN.value]
        or (b.status in [SpaBookingStatus.BOOKED.value, SpaBookingStatus.CONFIRMED.value] and b.start_time <= current_time <= b.end_time)
    )

    # Therapists who have availability today or are active
    active_therapists = (
        db.query(SpaStaff)
        .filter(SpaStaff.is_therapist.is_(True), SpaStaff.is_active.is_(True))
        .all()
    )
    available_therapists_count = max(0, len([t for t in active_therapists if t.id not in busy_therapist_ids]))

    # 5. Financials
    # Today's collected revenue from payments paid today
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    today_revenue_res = (
        db.query(func.sum(SpaPayment.amount))
        .filter(
            SpaPayment.paid_at >= start_of_day,
            SpaPayment.paid_at <= end_of_day,
            SpaPayment.payment_status == SpaPaymentStatus.PAID.value
        )
        .scalar()
    )
    today_revenue = Decimal(str(today_revenue_res or 0))

    # Pending invoices count & total outstanding balance across all invoices
    pending_invoices_count = (
        db.query(func.count(SpaInvoice.id))
        .filter(SpaInvoice.payment_status.in_([SpaPaymentStatus.PENDING.value, SpaPaymentStatus.PARTIALLY_PAID.value]))
        .scalar() or 0
    )

    outstanding_balance_res = (
        db.query(func.sum(SpaInvoice.balance_due))
        .filter(SpaInvoice.balance_due > 0)
        .scalar()
    )
    outstanding_balance = Decimal(str(outstanding_balance_res or 0))

    schedule_responses = [build_booking_response(b, db) for b in today_bookings]

    return SpaDashboardSummaryResponse(
        total_bookings_today=total_today,
        upcoming_bookings=total_upcoming,
        in_progress_appointments=in_progress,
        completed_appointments_today=completed_today,
        cancelled_appointments_today=cancelled_today,
        total_customers=total_customers,
        active_services=active_services,
        available_therapists=available_therapists_count,
        total_therapists=total_therapists,
        today_revenue=today_revenue,
        pending_payments_count=pending_invoices_count,
        outstanding_balance=outstanding_balance,
        today_schedule=schedule_responses,
    )
