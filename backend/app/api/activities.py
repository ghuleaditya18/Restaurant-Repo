"""Activities Module – FastAPI Router.

Provides comprehensive endpoints for:
- Activity CRUD (catalog, resources, media)
- Weekly schedules and session management
- Three booking types: time_slot, session, walk_in
- Participant management and roster
- Walk-in usage logs
- Dashboard, reports, customers, invoices, payments
"""
from __future__ import annotations

import csv
import datetime
import hashlib
import io
import math
import secrets
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, require_activity_context
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.core.security import hash_password
from app.db.session import get_db
from app.models import Customer, Invoice, Order, Payment, Staff, User
from app.models.activities import (
    Activity,
    ActivityBooking,
    ActivityBookingHistory,
    ActivityInstructorAssignment,
    ActivityMedia,
    ActivityParticipant,
    ActivityResource,
    ActivitySchedule,
    ActivitySession,
    ActivityUsageLog,
)
from app.models.entities import PaymentMethod, PaymentStatus, UserRole
from app.schemas.activities import (
    ActivityCreate,
    ActivityInvoiceCreate,
    ActivityMediaOut,
    ActivityOut,
    ActivityStaffCreate,
    ActivityStaffUpdate,
    ActivityUpdate,
    BookingCreate,
    BookingOut,
    BookingStatusUpdate,
    BulkDeleteRequest,
    BulkParticipantUpdateRequest,
    CustomerCreate,
    CustomerOut,
    ParticipantOut,
    ParticipantUpdate,
    PaymentCreate,
    ResourceCreate,
    ResourceUpdate,
    ScheduleCreate,
    SessionCreate,
    SessionOut,
    SessionUpdate,
    UsageLogCreate,
    UsageLogOut,
)
from app.services.activities_service import (
    ACTIVITY_CATEGORY_CONFIG,
    PAYMENT_METHOD_ENUM_MAP,
    generate_activity_invoice_pdf,
    money,
    sync_activity_invoice_financials,
)
from app.services.entity_image_service import validate_image_file

router = APIRouter()

BUSINESS_CONTEXT = "ACTIVITY"

# Valid booking status transitions
VALID_TRANSITIONS: dict[str, set[str]] = {
    "Pending": {"Confirmed", "Cancelled"},
    "Confirmed": {"Completed", "Cancelled", "No Show"},
    "Completed": set(),
    "Cancelled": set(),
    "No Show": set(),
}


# ==========================================
# HELPERS
# ==========================================

def _assert_activity_context(user: User) -> None:
    biz = str(getattr(user, "business_context", "") or "").upper()
    if biz not in {"ACTIVITY", "ACTIVITIES"}:
        raise HTTPException(status_code=403, detail="Access denied: Activities account required")


def _serialize_time(t: Any) -> str | None:
    if t is None:
        return None
    if isinstance(t, datetime.time):
        return t.strftime("%H:%M")
    return str(t)


def _enrich_session(session: ActivitySession, db: Session) -> dict:
    """Calculate derived session fields."""
    seats_booked = db.scalar(
        select(func.coalesce(func.sum(ActivityBooking.participant_count), 0)).where(
            ActivityBooking.session_id == session.id,
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
            ActivityBooking.is_deleted.is_(False),
        )
    ) or 0
    seats_remaining = max(0, session.capacity - seats_booked)
    is_full = seats_remaining == 0

    staff_name = None
    if session.assigned_staff_id:
        staff = db.get(User, session.assigned_staff_id)
        staff_name = staff.full_name if staff else None

    activity = session.activity if session.activity else db.get(Activity, session.activity_id)
    min_participants = activity.min_participants if activity else 1
    below_minimum = session.status in ("Scheduled", "In Progress") and seats_booked < min_participants

    return {
        "id": session.id,
        "activity_id": session.activity_id,
        "activity_name": activity.name if activity else "",
        "activity_category": activity.category if activity else "",
        "booking_type": activity.booking_type if activity else "",
        "location_name": activity.location_name if activity else None,
        "min_participants": min_participants,
        "below_minimum": below_minimum,
        "schedule_id": session.schedule_id,
        "session_date": session.session_date,
        "start_time": _serialize_time(session.start_time),
        "end_time": _serialize_time(session.end_time),
        "capacity": session.capacity,
        "assigned_staff_id": session.assigned_staff_id,
        "assigned_staff_name": staff_name,
        "status": session.status,
        "notes": session.notes,
        "cancelled_reason": session.cancelled_reason,
        "seats_booked": seats_booked,
        "seats_remaining": seats_remaining,
        "is_full": is_full,
        "created_at": session.created_at,
    }


def _enrich_booking(booking: ActivityBooking, db: Session) -> dict:
    customer = db.get(Customer, booking.customer_id) if booking.customer_id else None
    activity = db.get(Activity, booking.activity_id) if booking.activity_id else None
    session = db.get(ActivitySession, booking.session_id) if booking.session_id else None
    resource = db.get(ActivityResource, booking.resource_id) if booking.resource_id else None
    invoice = db.scalar(
        select(Invoice).where(
            Invoice.source_module == BUSINESS_CONTEXT,
            Invoice.source_reference_id == booking.id,
        )
    )
    pay_status = (
        getattr(invoice.payment_status, "value", str(invoice.payment_status))
        if invoice
        else None
    )

    participants = [
        {
            "id": p.id,
            "booking_id": p.booking_id,
            "participant_name": p.participant_name,
            "age": p.age,
            "waiver_signed": p.waiver_signed,
            "attendance_status": p.attendance_status,
            "notes": p.notes,
        }
        for p in booking.participants
    ]
    history = [
        {
            "id": h.id,
            "action": h.action,
            "previous_status": h.previous_status,
            "new_status": h.new_status,
            "reason": h.reason,
            "changed_at": h.changed_at,
        }
        for h in booking.history
    ]

    return {
        "id": booking.id,
        "business_context": booking.business_context,
        "booking_number": booking.booking_number,
        "activity_id": booking.activity_id,
        "activity_name": activity.name if activity else booking.activity_name_snapshot,
        "activity_category": activity.category if activity else "",
        "booking_type": activity.booking_type if activity else booking.booking_type_snapshot,
        "requires_waiver": activity.requires_waiver if activity else False,
        "customer_id": booking.customer_id,
        "customer_name": customer.full_name if customer else "",
        "customer_phone": customer.phone if customer else "",
        "customer_email": customer.email if customer else None,
        "session_id": booking.session_id,
        "session_date": session.session_date if session else None,
        "session_start_time": _serialize_time(session.start_time) if session else None,
        "session_end_time": _serialize_time(session.end_time) if session else None,
        "resource_id": booking.resource_id,
        "resource_name": resource.name if resource else None,
        "booking_date": booking.booking_date,
        "slot_date": booking.slot_date,
        "slot_start_time": _serialize_time(booking.slot_start_time),
        "slot_end_time": _serialize_time(booking.slot_end_time),
        "participant_count": booking.participant_count,
        "booking_type_snapshot": booking.booking_type_snapshot,
        "activity_name_snapshot": booking.activity_name_snapshot,
        "pricing_method": booking.pricing_method,
        "unit_price_snapshot": str(booking.unit_price_snapshot),
        "total_amount": str(booking.total_amount),
        "status": booking.status,
        "cancellation_reason": booking.cancellation_reason,
        "cancelled_at": booking.cancelled_at,
        "package_booking_id": booking.package_booking_id,
        "stay_reference": booking.stay_reference,
        "notes": booking.notes,
        "invoice_id": invoice.id if invoice else None,
        "invoice_number": invoice.invoice_number if invoice else None,
        "payment_status": pay_status,
        "invoice_paid": str(invoice.paid_amount) if invoice else "0.00",
        "invoice_balance_due": str(invoice.balance_due) if invoice else str(booking.total_amount),
        "is_deleted": booking.is_deleted,
        "created_at": booking.created_at,
        "participants": participants,
        "history": history,
    }


def _serialize_media(m: ActivityMedia) -> dict:
    version = int(m.updated_at.timestamp()) if m.updated_at else 1
    return {
        "id": m.id,
        "activity_id": m.activity_id,
        "media_type": m.media_type,
        "mime_type": m.mime_type,
        "file_size": m.file_size,
        "file_name": m.file_name,
        "caption": m.caption,
        "sort_order": m.sort_order,
        "url": f"/api/activities/media/{m.id}/image?v={version}",
    }


def _serialize_activity(a: Activity, db: Session, *, include_children: bool = False) -> dict:
    cover_url = a.cover_image_url
    media_list = sorted(a.media or [], key=lambda m: (m.sort_order, m.id))
    if not cover_url and media_list:
        cover_item = next((m for m in media_list if m.media_type == "cover"), None) or media_list[0]
        version = int(cover_item.updated_at.timestamp()) if cover_item.updated_at else 1
        cover_url = f"/api/activities/media/{cover_item.id}/image?v={version}"

    booking_count = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.activity_id == a.id,
            ActivityBooking.is_deleted.is_(False),
        )
    ) or 0

    assigned_rows = db.execute(
        select(ActivityInstructorAssignment, User, Staff)
        .join(User, ActivityInstructorAssignment.staff_user_id == User.id)
        .outerjoin(Staff, Staff.user_id == User.id)
        .where(
            ActivityInstructorAssignment.activity_id == a.id,
            User.business_context == BUSINESS_CONTEXT,
        )
        .order_by(User.full_name)
    ).all()

    payload = {
        "id": a.id,
        "business_context": a.business_context,
        "activity_code": a.activity_code,
        "name": a.name,
        "category": a.category,
        "description": a.description,
        "location_name": a.location_name,
        "booking_type": a.booking_type,
        "duration_minutes": a.duration_minutes,
        "safety_notes": a.safety_notes,
        "required_equipment": a.required_equipment,
        "min_participants": a.min_participants,
        "max_participants": a.max_participants,
        "min_age": a.min_age,
        "max_age": a.max_age,
        "requires_waiver": a.requires_waiver,
        "default_staff_id": a.default_staff_id,
        "assigned_instructor_ids": [u.id for _, u, _ in assigned_rows],
        "assigned_instructors": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "employee_code": st.employee_code if st else None,
                "designation": st.designation if st else "Instructor",
                "is_active": u.is_active,
            }
            for _, u, st in assigned_rows
        ],
        "is_complimentary": a.is_complimentary,
        "price_per_person": str(a.price_per_person) if a.price_per_person is not None else None,
        "price_per_group": str(a.price_per_group) if a.price_per_group is not None else None,
        "status": a.status,
        "cover_image_url": cover_url,
        "is_deleted": a.is_deleted,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
        "resources": [
            {
                "id": r.id,
                "activity_id": r.activity_id,
                "name": r.name,
                "description": r.description,
                "capacity": r.capacity,
                "is_active": r.is_active,
            }
            for r in (a.resources or [])
        ],
        "media_count": len(media_list),
        "booking_count": booking_count,
    }
    if include_children:
        payload["media"] = [_serialize_media(m) for m in media_list]
    return payload


def _parse_time(value: str | None) -> datetime.time | None:
    if not value:
        return None
    try:
        parts = value.split(":")
        return datetime.time(int(parts[0]), int(parts[1]))
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid time format: '{value}'. Expected HH:MM")


# ==========================================
# SETTINGS / CATEGORIES
# ==========================================

@router.get("/settings")
def get_settings(current_user: User = Depends(require_activity_context)):
    return {
        "categories": [c["name"] for c in ACTIVITY_CATEGORY_CONFIG],
        "category_details": ACTIVITY_CATEGORY_CONFIG,
        "booking_types": ["time_slot", "session", "walk_in"],
        "activity_statuses": ["Active", "Inactive", "Archived"],
        "session_statuses": ["Scheduled", "In Progress", "Completed", "Cancelled"],
        "booking_statuses": ["Pending", "Confirmed", "Completed", "Cancelled", "No Show"],
        "pricing_methods": ["per_person", "per_group", "complimentary"],
        "timezone": "Asia/Kolkata",
    }


# ==========================================
# DASHBOARD
# ==========================================

@router.get("/dashboard")
def get_dashboard(
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    today = get_kolkata_today()

    total_activities = db.scalar(
        select(func.count(Activity.id)).where(
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.is_deleted.is_(False),
        )
    ) or 0

    active_activities = db.scalar(
        select(func.count(Activity.id)).where(
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.status == "Active",
            Activity.is_deleted.is_(False),
        )
    ) or 0

    sessions_today = db.scalar(
        select(func.count(ActivitySession.id))
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivitySession.session_date == today,
            ActivitySession.status != "Cancelled",
        )
    ) or 0

    bookings_today = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.booking_date == today,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status != "Cancelled",
        )
    ) or 0

    upcoming_bookings = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
            ActivityBooking.booking_date >= today,
        )
    ) or 0

    cancelled_today = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.booking_date == today,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.status == "Cancelled",
            ActivityBooking.is_deleted.is_(False),
        )
    ) or 0

    total_participants_today = db.scalar(
        select(func.coalesce(func.sum(ActivityBooking.participant_count), 0)).where(
            ActivityBooking.booking_date == today,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status.in_(["Pending", "Confirmed", "Completed"]),
        )
    ) or 0

    walkin_participants_today = db.scalar(
        select(func.coalesce(func.sum(ActivityUsageLog.participant_count), 0))
        .join(Activity, ActivityUsageLog.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivityUsageLog.usage_date == today,
        )
    ) or 0

    # Revenue received today (paid payments + walk-in usage charges today)
    payments_today = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.source_module == BUSINESS_CONTEXT,
            Payment.status == PaymentStatus.PAID,
            func.date(Payment.paid_at) == today,
        )
    ) or Decimal("0.00")
    walkin_revenue_today = db.scalar(
        select(func.coalesce(func.sum(ActivityUsageLog.amount_charged), 0))
        .join(Activity, ActivityUsageLog.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivityUsageLog.usage_date == today,
        )
    ) or Decimal("0.00")
    revenue_today = money(payments_today) + money(walkin_revenue_today)

    stats = {
        "total_activities": total_activities,
        "active_activities": active_activities,
        "sessions_today": sessions_today,
        "bookings_today": bookings_today,
        "upcoming_bookings": upcoming_bookings,
        "cancelled_today": cancelled_today,
        "total_participants_today": total_participants_today + walkin_participants_today,
        "revenue_today": str(revenue_today),
    }

    # Operational alerts shared with Header Notification Bar & Dashboard
    alerts, todays_sess_rows = _compute_activity_alerts(db, today=today)

    todays_sessions = [_enrich_session(s, db) for s in todays_sess_rows[:100]]

    upcoming_rows = (
        db.execute(
            select(ActivityBooking)
            .where(
                ActivityBooking.business_context == BUSINESS_CONTEXT,
                ActivityBooking.is_deleted.is_(False),
                ActivityBooking.status.in_(["Pending", "Confirmed"]),
                ActivityBooking.booking_date >= today,
            )
            .options(selectinload(ActivityBooking.participants), selectinload(ActivityBooking.history))
            .order_by(ActivityBooking.booking_date, ActivityBooking.id)
            .limit(100)
        )
        .scalars()
        .all()
    )
    upcoming_booking_list = [_enrich_booking(b, db) for b in upcoming_rows]

    return {
        "statistics": stats,
        "alerts": alerts,
        "todays_sessions": todays_sessions,
        "upcoming_bookings": upcoming_booking_list,
    }


def _compute_activity_alerts(db: Session, *, today: datetime.date | None = None) -> tuple[list[dict], list[ActivitySession]]:
    if today is None:
        today = get_kolkata_today()

    alerts: list[dict] = []

    todays_sess_rows = (
        db.execute(
            select(ActivitySession)
            .join(Activity, ActivitySession.activity_id == Activity.id)
            .where(
                Activity.business_context == BUSINESS_CONTEXT,
                ActivitySession.session_date == today,
                ActivitySession.status != "Cancelled",
            )
            .options(joinedload(ActivitySession.activity))
            .order_by(ActivitySession.start_time)
        )
        .scalars()
        .all()
    )

    upcoming_unassigned = db.scalar(
        select(func.count(ActivitySession.id))
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivitySession.session_date >= today,
            ActivitySession.status.in_(["Scheduled", "In Progress"]),
            ActivitySession.assigned_staff_id.is_(None),
        )
    ) or 0

    full_count = 0
    below_min_count = 0
    for s in todays_sess_rows:
        if s.status in ("Scheduled", "In Progress"):
            booked = db.scalar(
                select(func.coalesce(func.sum(ActivityBooking.participant_count), 0)).where(
                    ActivityBooking.session_id == s.id,
                    ActivityBooking.status.in_(["Pending", "Confirmed"]),
                    ActivityBooking.is_deleted.is_(False),
                )
            ) or 0
            if booked >= s.capacity:
                full_count += 1
            min_req = s.activity.min_participants if s.activity else 1
            if booked < min_req:
                below_min_count += 1

    if upcoming_unassigned > 0:
        alerts.append({
            "id": "unassigned_staff",
            "severity": "warning",
            "title": f"{upcoming_unassigned} session(s) without assigned instructor",
            "message": "Assign instructors to scheduled sessions before start time.",
            "route": "/activities/schedule",
        })

    pending_bookings = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status == "Pending",
            ActivityBooking.booking_date >= today,
        )
    ) or 0
    if pending_bookings > 0:
        alerts.append({
            "id": "pending_bookings",
            "severity": "warning",
            "title": f"{pending_bookings} booking(s) pending confirmation",
            "message": "Review and confirm upcoming guest reservations.",
            "route": "/activities/bookings?status=Pending",
        })

    unsigned_waivers = db.scalar(
        select(func.count(ActivityParticipant.id))
        .join(ActivityBooking, ActivityParticipant.booking_id == ActivityBooking.id)
        .join(Activity, ActivityBooking.activity_id == Activity.id)
        .where(
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            Activity.requires_waiver.is_(True),
            ActivityParticipant.waiver_signed.is_(False),
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
            ActivityBooking.is_deleted.is_(False),
        )
    ) or 0
    if unsigned_waivers > 0:
        alerts.append({
            "id": "unsigned_waivers",
            "severity": "warning",
            "title": f"{unsigned_waivers} participant(s) require waiver completion",
            "message": "Complete waiver signatures in Session Roster or Bookings before participation.",
            "route": "/activities/roster",
        })

    if below_min_count > 0:
        alerts.append({
            "id": "below_minimum",
            "severity": "warning",
            "title": f"{below_min_count} session(s) below minimum participant count today",
            "message": "Advisory notice: coordinator review recommended. Sessions are never auto-cancelled.",
            "route": "/activities/schedule",
        })

    if full_count > 0:
        alerts.append({
            "id": "full_sessions",
            "severity": "info",
            "title": f"{full_count} fully booked session(s) today",
            "message": "Capacity reached; additional guests should be placed in another session.",
            "route": "/activities/schedule",
        })

    return alerts, todays_sess_rows


@router.get("/notifications")
def get_activity_notifications(
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    """Live actionable operational notifications for the top-right header notification bar."""
    alerts, _ = _compute_activity_alerts(db)
    return {"unread_count": len(alerts), "items": alerts}


# ==========================================
# ACTIVITY CATALOG CRUD
# ==========================================

@router.get("/activities")
def list_activities(
    search: str | None = None,
    category: str | None = None,
    booking_type: str | None = None,
    status: str | None = None,
    include_archived: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = select(Activity).where(Activity.business_context == BUSINESS_CONTEXT)
    if not include_archived and status != "Archived":
        q = q.where(Activity.is_deleted.is_(False))
    if search:
        like = f"%{search}%"
        q = q.where(or_(Activity.name.ilike(like), Activity.activity_code.ilike(like), Activity.location_name.ilike(like)))
    if category:
        q = q.where(Activity.category == category)
    if booking_type:
        q = q.where(Activity.booking_type == booking_type)
    if status:
        q = q.where(Activity.status == status)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(
        q.options(selectinload(Activity.resources), selectinload(Activity.media))
        .order_by(Activity.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    items = [_serialize_activity(a, db, include_children=True) for a in rows]
    total_pages = max(1, math.ceil(total / page_size))
    return {"total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": items}


@router.get("/activities/{activity_id}")
def get_activity(
    activity_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.execute(
        select(Activity)
        .where(Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT)
        .options(selectinload(Activity.resources), selectinload(Activity.media))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    return _serialize_activity(a, db, include_children=True)


def _sync_activity_instructors(db: Session, activity_id: int, instructor_ids: list[int] | None) -> None:
    if instructor_ids is None:
        return
    clean_ids = list(dict.fromkeys(int(i) for i in instructor_ids))
    db.query(ActivityInstructorAssignment).filter(
        ActivityInstructorAssignment.activity_id == activity_id
    ).delete(synchronize_session=False)
    for uid in clean_ids:
        u = db.scalar(select(User).where(User.id == uid, User.business_context == BUSINESS_CONTEXT))
        if u:
            db.add(ActivityInstructorAssignment(staff_user_id=uid, activity_id=activity_id))


def _sync_staff_activities(db: Session, staff_user_id: int, activity_ids: list[int] | None) -> None:
    if activity_ids is None:
        return
    clean_ids = list(dict.fromkeys(int(i) for i in activity_ids))
    db.query(ActivityInstructorAssignment).filter(
        ActivityInstructorAssignment.staff_user_id == staff_user_id
    ).delete(synchronize_session=False)
    for aid in clean_ids:
        act = db.scalar(
            select(Activity).where(
                Activity.id == aid,
                Activity.business_context == BUSINESS_CONTEXT,
                Activity.is_deleted.is_(False),
            )
        )
        if act:
            db.add(ActivityInstructorAssignment(staff_user_id=staff_user_id, activity_id=aid))


@router.post("/activities", status_code=status.HTTP_201_CREATED)
def create_activity(
    data: ActivityCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    # Check unique code
    existing = db.scalar(
        select(Activity).where(
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.activity_code == data.activity_code,
            Activity.is_deleted.is_(False),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Activity code '{data.activity_code}' already exists.")

    a = Activity(
        business_context=BUSINESS_CONTEXT,
        activity_code=data.activity_code,
        name=data.name,
        category=data.category,
        description=data.description,
        location_name=data.location_name,
        booking_type=data.booking_type,
        duration_minutes=data.duration_minutes,
        safety_notes=data.safety_notes,
        required_equipment=data.required_equipment,
        min_participants=data.min_participants,
        max_participants=data.max_participants,
        min_age=data.min_age,
        max_age=data.max_age,
        requires_waiver=data.requires_waiver,
        default_staff_id=data.default_staff_id,
        is_complimentary=data.is_complimentary,
        price_per_person=data.price_per_person,
        price_per_group=data.price_per_group,
        status=data.status,
        created_by=current_user.id,
    )
    db.add(a)
    try:
        db.flush()
        instructor_ids = list(data.assigned_instructor_ids or [])
        if data.default_staff_id and data.default_staff_id not in instructor_ids:
            instructor_ids.append(data.default_staff_id)
        if instructor_ids:
            _sync_activity_instructors(db, a.id, instructor_ids)
        db.commit()
        db.refresh(a)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": a.id, "message": "Activity created successfully."}


@router.patch("/activities/{activity_id}")
def update_activity(
    activity_id: int,
    data: ActivityUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(
        select(Activity).where(
            Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT, Activity.is_deleted.is_(False)
        )
    )
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")

    if data.activity_code and data.activity_code != a.activity_code:
        existing = db.scalar(
            select(Activity).where(
                Activity.business_context == BUSINESS_CONTEXT,
                Activity.activity_code == data.activity_code,
                Activity.id != activity_id,
                Activity.is_deleted.is_(False),
            )
        )
        if existing:
            raise HTTPException(status_code=409, detail=f"Activity code '{data.activity_code}' already in use.")

    new_min = data.min_participants if data.min_participants is not None else a.min_participants
    new_max = data.max_participants if data.max_participants is not None else a.max_participants
    if new_min < 1 or new_max < new_min:
        raise HTTPException(
            status_code=422,
            detail="max_participants must be greater than or equal to min_participants (>= 1).",
        )

    if data.max_participants is not None and data.max_participants < a.max_participants:
        # Capacity must never be reduced below the number of already booked participants
        max_booking_party = db.scalar(
            select(func.coalesce(func.max(ActivityBooking.participant_count), 0)).where(
                ActivityBooking.activity_id == activity_id,
                ActivityBooking.status.in_(["Pending", "Confirmed"]),
                ActivityBooking.is_deleted.is_(False),
            )
        ) or 0
        if new_max < max_booking_party:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot reduce maximum participants below existing booking party size ({max_booking_party}).",
            )

    for field, value in data.model_dump(exclude_none=True, exclude={"assigned_instructor_ids"}).items():
        setattr(a, field, value)

    if data.assigned_instructor_ids is not None:
        instructor_ids = list(data.assigned_instructor_ids)
        if a.default_staff_id and a.default_staff_id not in instructor_ids:
            instructor_ids.append(a.default_staff_id)
        _sync_activity_instructors(db, a.id, instructor_ids)
    elif data.default_staff_id:
        existing_link = db.scalar(
            select(ActivityInstructorAssignment).where(
                ActivityInstructorAssignment.activity_id == a.id,
                ActivityInstructorAssignment.staff_user_id == data.default_staff_id,
            )
        )
        if not existing_link:
            db.add(ActivityInstructorAssignment(staff_user_id=data.default_staff_id, activity_id=a.id))

    try:
        db.commit()
        db.refresh(a)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": a.id, "message": "Activity updated successfully."}


@router.post("/activities/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    body: dict,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    new_status = body.get("status")
    if new_status not in ["Active", "Inactive", "Archived"]:
        raise HTTPException(status_code=422, detail="status must be Active, Inactive, or Archived")

    a = db.scalar(
        select(Activity).where(
            Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT
        )
    )
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")

    a.status = new_status
    if new_status == "Archived":
        a.is_deleted = True
        a.deleted_at = get_kolkata_now()
    else:
        a.is_deleted = False
        a.deleted_at = None
    db.commit()
    return {"message": f"Activity status updated to {new_status}"}


def _purge_activity_bookings(db: Session, booking_ids: list[int]) -> None:
    """Remove activity bookings and dependent invoices, payments, participants, and history in FK order."""
    if not booking_ids:
        return
    invoice_ids = list(
        db.scalars(
            select(Invoice.id).where(
                Invoice.source_module == BUSINESS_CONTEXT,
                Invoice.source_reference_id.in_(booking_ids),
            )
        ).all()
    )
    if invoice_ids:
        db.query(Payment).filter(
            Payment.invoice_id.in_(invoice_ids),
            Payment.source_module == BUSINESS_CONTEXT,
        ).delete(synchronize_session=False)
        db.query(Invoice).filter(
            Invoice.id.in_(invoice_ids),
            Invoice.source_module == BUSINESS_CONTEXT,
        ).delete(synchronize_session=False)
    db.query(ActivityParticipant).filter(ActivityParticipant.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(ActivityBookingHistory).filter(ActivityBookingHistory.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(ActivityBooking).filter(
        ActivityBooking.id.in_(booking_ids),
        ActivityBooking.business_context == BUSINESS_CONTEXT,
    ).delete(synchronize_session=False)


def _delete_or_archive_activity(db: Session, a: Activity) -> str:
    """Delete an activity permanently if unused, or archive it when history exists. Returns 'deleted' or 'archived'."""
    active_bookings = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.activity_id == a.id,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
        )
    ) or 0
    if active_bookings:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete activity with active bookings. Archive or clear bookings first.",
        )

    has_history = (
        (db.scalar(select(func.count(ActivityBooking.id)).where(ActivityBooking.activity_id == a.id)) or 0)
        + (db.scalar(select(func.count(ActivitySession.id)).where(ActivitySession.activity_id == a.id)) or 0)
        + (db.scalar(select(func.count(ActivityUsageLog.id)).where(ActivityUsageLog.activity_id == a.id)) or 0)
    )
    if has_history > 0:
        a.is_deleted = True
        a.deleted_at = get_kolkata_now()
        a.status = "Archived"
        return "archived"

    db.delete(a)
    return "deleted"


@router.delete("/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(
        select(Activity).where(
            Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT, Activity.is_deleted.is_(False)
        )
    )
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")

    outcome = _delete_or_archive_activity(db, a)
    db.commit()
    if outcome == "archived":
        return {"message": "Activity has booking/session history and was archived safely."}
    return {"message": "Activity deleted permanently."}


@router.post("/activities/bulk-delete")
def bulk_delete_activities(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    archived = 0
    failed: list[dict[str, Any]] = []
    for activity_id in dict.fromkeys(data.ids):
        a = db.scalar(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.business_context == BUSINESS_CONTEXT,
                Activity.is_deleted.is_(False),
            )
        )
        if not a:
            failed.append({"id": activity_id, "name": f"#{activity_id}", "reason": "Activity not found or already archived."})
            continue
        try:
            outcome = _delete_or_archive_activity(db, a)
            db.flush()
            if outcome == "archived":
                archived += 1
            else:
                deleted += 1
        except HTTPException as exc:
            failed.append({"id": activity_id, "name": a.name, "reason": str(exc.detail)})
    db.commit()
    return {
        "deleted": deleted,
        "archived": archived,
        "cleared": deleted + archived,
        "failed": failed,
        "message": f"Cleared {deleted + archived} activity record(s) ({deleted} deleted, {archived} archived).",
    }


# ==========================================
# RESOURCES (time_slot)
# ==========================================

@router.get("/activities/{activity_id}/resources")
def list_resources(
    activity_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ActivityResource).where(ActivityResource.activity_id == activity_id).order_by(ActivityResource.name)
    ).scalars().all()
    return [{"id": r.id, "activity_id": r.activity_id, "name": r.name, "description": r.description,
             "capacity": r.capacity, "is_active": r.is_active} for r in rows]


@router.post("/activities/{activity_id}/resources", status_code=201)
def create_resource(
    activity_id: int,
    data: ResourceCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT))
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    r = ActivityResource(activity_id=activity_id, **data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "message": "Resource created."}


@router.patch("/resources/{resource_id}")
def update_resource(
    resource_id: int,
    data: ResourceUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    r = db.get(ActivityResource, resource_id)
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(r, field, value)
    db.commit()
    return {"message": "Resource updated."}


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    r = db.get(ActivityResource, resource_id)
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    # Check for active bookings on this resource
    active = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.resource_id == resource_id,
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
            ActivityBooking.is_deleted.is_(False),
        )
    ) or 0
    if active:
        raise HTTPException(status_code=409, detail="Cannot delete resource with active bookings.")
    db.delete(r)
    db.commit()
    return {"message": "Resource deleted."}


# Check resource availability
@router.get("/resources/{resource_id}/availability")
def check_resource_availability(
    resource_id: int,
    slot_date: datetime.date = Query(...),
    start_time: str = Query(...),
    end_time: str = Query(...),
    exclude_booking_id: int | None = None,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    start_t = _parse_time(start_time)
    end_t = _parse_time(end_time)
    if end_t <= start_t:
        raise HTTPException(status_code=422, detail="end_time must be after start_time.")

    conflict_q = select(ActivityBooking).where(
        ActivityBooking.resource_id == resource_id,
        ActivityBooking.slot_date == slot_date,
        ActivityBooking.status.in_(["Pending", "Confirmed"]),
        ActivityBooking.is_deleted.is_(False),
        ActivityBooking.slot_start_time < end_t,
        ActivityBooking.slot_end_time > start_t,
    )
    if exclude_booking_id:
        conflict_q = conflict_q.where(ActivityBooking.id != exclude_booking_id)

    conflict = db.execute(conflict_q).scalar_one_or_none()
    occupied_rows = db.execute(
        select(ActivityBooking)
        .where(
            ActivityBooking.resource_id == resource_id,
            ActivityBooking.slot_date == slot_date,
            ActivityBooking.status.in_(["Pending", "Confirmed"]),
            ActivityBooking.is_deleted.is_(False),
        )
        .order_by(ActivityBooking.slot_start_time)
    ).scalars().all()
    return {
        "available": conflict is None,
        "conflict_booking_id": conflict.id if conflict else None,
        "conflict_booking_number": conflict.booking_number if conflict else None,
        "occupied_slots": [
            {
                "booking_id": o.id,
                "booking_number": o.booking_number,
                "start_time": _serialize_time(o.slot_start_time),
                "end_time": _serialize_time(o.slot_end_time),
            }
            for o in occupied_rows
        ],
    }


# ==========================================
# SCHEDULES
# ==========================================

@router.get("/activities/{activity_id}/schedules")
def list_schedules(
    activity_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ActivitySchedule).where(ActivitySchedule.activity_id == activity_id).order_by(ActivitySchedule.valid_from)
    ).scalars().all()
    return [
        {
            "id": s.id,
            "activity_id": s.activity_id,
            "operating_weekdays": s.operating_weekdays,
            "start_time": _serialize_time(s.start_time),
            "end_time": _serialize_time(s.end_time),
            "valid_from": s.valid_from,
            "valid_to": s.valid_to,
            "default_capacity": s.default_capacity,
            "default_staff_id": s.default_staff_id,
            "is_active": s.is_active,
            "notes": s.notes,
            "created_at": s.created_at,
        }
        for s in rows
    ]


@router.post("/activities/{activity_id}/schedules", status_code=201)
def create_schedule(
    activity_id: int,
    data: ScheduleCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT))
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")

    s = ActivitySchedule(
        activity_id=activity_id,
        operating_weekdays=",".join(str(d) for d in data.operating_weekdays),
        start_time=_parse_time(data.start_time),
        end_time=_parse_time(data.end_time),
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        default_capacity=data.default_capacity,
        default_staff_id=data.default_staff_id,
        is_active=data.is_active,
        notes=data.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "message": "Schedule created."}


@router.delete("/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    schedule = db.scalar(
        select(ActivitySchedule)
        .join(Activity, ActivitySchedule.activity_id == Activity.id)
        .where(ActivitySchedule.id == schedule_id, Activity.business_context == BUSINESS_CONTEXT)
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Weekly schedule template not found.")
    db.delete(schedule)
    db.commit()
    return {"message": "Weekly schedule template deleted."}


@router.post("/schedules/bulk-delete")
def bulk_delete_schedules(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    failed: list[dict[str, Any]] = []
    for schedule_id in dict.fromkeys(data.ids):
        schedule = db.scalar(
            select(ActivitySchedule)
            .join(Activity, ActivitySchedule.activity_id == Activity.id)
            .where(ActivitySchedule.id == schedule_id, Activity.business_context == BUSINESS_CONTEXT)
        )
        if not schedule:
            failed.append({"id": schedule_id, "name": f"Template #{schedule_id}", "reason": "Template not found."})
            continue
        db.delete(schedule)
        deleted += 1
    db.commit()
    return {"deleted": deleted, "failed": failed, "message": f"Deleted {deleted} schedule template(s)."}


@router.post("/schedules/{schedule_id}/generate-sessions", status_code=201)
def generate_sessions_from_schedule(
    schedule_id: int,
    body: dict,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    """Generate individual sessions from a weekly schedule template."""
    schedule = db.get(ActivitySchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    from_date = body.get("from_date")
    to_date = body.get("to_date")
    if not from_date or not to_date:
        raise HTTPException(status_code=422, detail="from_date and to_date required")

    try:
        from_dt = datetime.date.fromisoformat(str(from_date))
        to_dt = datetime.date.fromisoformat(str(to_date))
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD")

    # Clamp to schedule validity
    from_dt = max(from_dt, schedule.valid_from)
    to_dt = min(to_dt, schedule.valid_to)
    if from_dt > to_dt:
        raise HTTPException(status_code=422, detail="Requested date range is outside schedule validity window.")

    today = datetime.date.today()
    if from_dt < today:
        from_dt = today

    weekdays = [int(d) for d in schedule.operating_weekdays.split(",") if d.strip()]

    created_count = 0
    skipped_count = 0
    cur = from_dt
    while cur <= to_dt:
        # 0=Mon...6=Sun (Python weekday)
        if cur.weekday() in weekdays:
            # Check if session already exists
            existing = db.scalar(
                select(ActivitySession).where(
                    ActivitySession.activity_id == schedule.activity_id,
                    ActivitySession.session_date == cur,
                    ActivitySession.start_time == schedule.start_time,
                )
            )
            if existing:
                skipped_count += 1
            else:
                sess = ActivitySession(
                    activity_id=schedule.activity_id,
                    schedule_id=schedule.id,
                    session_date=cur,
                    start_time=schedule.start_time,
                    end_time=schedule.end_time,
                    capacity=schedule.default_capacity,
                    assigned_staff_id=schedule.default_staff_id,
                    status="Scheduled",
                )
                db.add(sess)
                created_count += 1
        cur += datetime.timedelta(days=1)

    db.commit()
    return {"created": created_count, "skipped": skipped_count, "message": f"Generated {created_count} session(s)."}


# ==========================================
# SESSIONS
# ==========================================

@router.get("/sessions")
def list_sessions(
    activity_id: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    status: str | None = None,
    booking_type: str | None = None,
    assigned_staff_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = (
        select(ActivitySession)
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(Activity.business_context == BUSINESS_CONTEXT)
    )
    if activity_id:
        q = q.where(ActivitySession.activity_id == activity_id)
    if date_from:
        q = q.where(ActivitySession.session_date >= date_from)
    if date_to:
        q = q.where(ActivitySession.session_date <= date_to)
    if status:
        q = q.where(ActivitySession.status == status)
    if booking_type:
        q = q.where(Activity.booking_type == booking_type)
    if assigned_staff_id:
        q = q.where(ActivitySession.assigned_staff_id == assigned_staff_id)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(
        q.options(joinedload(ActivitySession.activity)).order_by(ActivitySession.session_date, ActivitySession.start_time)
        .offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()

    items = [_enrich_session(s, db) for s in rows]
    total_pages = max(1, math.ceil(total / page_size))
    return {"total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": items}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    s = db.execute(
        select(ActivitySession).where(ActivitySession.id == session_id).options(joinedload(ActivitySession.activity))
    ).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _enrich_session(s, db)


@router.post("/sessions", status_code=201)
def create_session(
    data: SessionCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(
        select(Activity).where(
            Activity.id == data.activity_id,
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.status == "Active",
            Activity.is_deleted.is_(False),
        )
    )
    if not a:
        raise HTTPException(status_code=404, detail="Active activity not found")

    if a.booking_type == "walk_in":
        raise HTTPException(status_code=422, detail="Walk-in activities do not use scheduled sessions.")

    today = get_kolkata_today()
    if data.session_date < today:
        raise HTTPException(status_code=422, detail="Session date cannot be in the past.")

    start_t = _parse_time(data.start_time)
    end_t = _parse_time(data.end_time)
    if end_t <= start_t:
        raise HTTPException(status_code=422, detail="end_time must be after start_time.")

    # Staff conflict check
    if data.assigned_staff_id:
        staff_conflict = db.scalar(
            select(ActivitySession).where(
                ActivitySession.assigned_staff_id == data.assigned_staff_id,
                ActivitySession.session_date == data.session_date,
                ActivitySession.status.in_(["Scheduled", "In Progress"]),
                ActivitySession.start_time < end_t,
                ActivitySession.end_time > start_t,
            )
        )
        if staff_conflict:
            raise HTTPException(
                status_code=409,
                detail="Assigned staff already has an overlapping session at this time."
            )

    sess = ActivitySession(
        activity_id=data.activity_id,
        schedule_id=data.schedule_id,
        session_date=data.session_date,
        start_time=start_t,
        end_time=end_t,
        capacity=data.capacity,
        assigned_staff_id=data.assigned_staff_id,
        status="Scheduled",
        notes=data.notes,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return {"id": sess.id, "message": "Session created."}


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: int,
    data: SessionUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    s = db.get(ActivitySession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    new_date = data.session_date if data.session_date is not None else s.session_date
    new_start = _parse_time(data.start_time) if data.start_time else s.start_time
    new_end = _parse_time(data.end_time) if data.end_time else s.end_time
    new_staff_id = (
        data.assigned_staff_id
        if "assigned_staff_id" in data.model_fields_set
        else s.assigned_staff_id
    )
    new_status = data.status if data.status else s.status

    if new_end <= new_start:
        raise HTTPException(status_code=422, detail="end_time must be after start_time.")

    if data.capacity is not None:
        booked = db.scalar(
            select(func.coalesce(func.sum(ActivityBooking.participant_count), 0)).where(
                ActivityBooking.session_id == session_id,
                ActivityBooking.status.in_(["Pending", "Confirmed"]),
                ActivityBooking.is_deleted.is_(False),
            )
        ) or 0
        if data.capacity < booked:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot reduce capacity below current bookings ({booked} participants booked)."
            )

    if new_staff_id and new_status in ("Scheduled", "In Progress"):
        staff_conflict = db.scalar(
            select(ActivitySession).where(
                ActivitySession.id != session_id,
                ActivitySession.assigned_staff_id == new_staff_id,
                ActivitySession.session_date == new_date,
                ActivitySession.status.in_(["Scheduled", "In Progress"]),
                ActivitySession.start_time < new_end,
                ActivitySession.end_time > new_start,
            )
        )
        if staff_conflict:
            raise HTTPException(
                status_code=409,
                detail="Assigned staff already has an overlapping session at this time.",
            )

    s.start_time = new_start
    s.end_time = new_end
    s.session_date = new_date
    if data.capacity is not None:
        s.capacity = data.capacity
    if "assigned_staff_id" in data.model_fields_set:
        s.assigned_staff_id = data.assigned_staff_id
    if data.status:
        s.status = data.status
    if data.notes is not None:
        s.notes = data.notes
    if data.cancelled_reason is not None:
        s.cancelled_reason = data.cancelled_reason

    db.commit()
    return {"message": "Session updated."}


def _delete_session_record(db: Session, session: ActivitySession) -> None:
    linked_bookings = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.session_id == session.id,
        )
    ) or 0
    if linked_bookings > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Session has {linked_bookings} linked booking(s). Clear those bookings first.",
        )
    db.delete(session)


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    s = db.scalar(
        select(ActivitySession)
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(ActivitySession.id == session_id, Activity.business_context == BUSINESS_CONTEXT)
    )
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    _delete_session_record(db, s)
    db.commit()
    return {"message": "Session deleted."}


@router.post("/sessions/bulk-delete")
def bulk_delete_sessions(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    failed: list[dict[str, Any]] = []
    for session_id in dict.fromkeys(data.ids):
        s = db.scalar(
            select(ActivitySession)
            .join(Activity, ActivitySession.activity_id == Activity.id)
            .where(ActivitySession.id == session_id, Activity.business_context == BUSINESS_CONTEXT)
            .options(joinedload(ActivitySession.activity))
        )
        if not s:
            failed.append({"id": session_id, "name": f"Session #{session_id}", "reason": "Session not found."})
            continue
        label = f"{s.activity.name if s.activity else 'Session'} ({s.session_date})"
        try:
            _delete_session_record(db, s)
            db.flush()
            deleted += 1
        except HTTPException as exc:
            failed.append({"id": session_id, "name": label, "reason": str(exc.detail)})
    db.commit()
    return {"deleted": deleted, "failed": failed, "message": f"Deleted {deleted} session(s)."}


# ==========================================
# BOOKINGS
# ==========================================

@router.get("/bookings")
def list_bookings(
    search: str | None = None,
    activity_id: int | None = None,
    customer_id: int | None = None,
    status: str | None = None,
    booking_type: str | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = (
        select(ActivityBooking)
        .outerjoin(Customer, ActivityBooking.customer_id == Customer.id)
        .where(
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
        )
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.where(
            or_(
                ActivityBooking.booking_number.ilike(like),
                ActivityBooking.activity_name_snapshot.ilike(like),
                Customer.full_name.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    if activity_id:
        q = q.where(ActivityBooking.activity_id == activity_id)
    if customer_id:
        q = q.where(ActivityBooking.customer_id == customer_id)
    if status:
        q = q.where(ActivityBooking.status == status)
    if booking_type:
        q = q.where(ActivityBooking.booking_type_snapshot == booking_type)
    if date_from:
        q = q.where(ActivityBooking.booking_date >= date_from)
    if date_to:
        q = q.where(ActivityBooking.booking_date <= date_to)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(
        q.options(selectinload(ActivityBooking.participants), selectinload(ActivityBooking.history))
        .order_by(ActivityBooking.booking_date.desc(), ActivityBooking.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": [_enrich_booking(b, db) for b in rows],
    }


@router.get("/bookings/{booking_id}")
def get_booking(
    booking_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    b = db.execute(
        select(ActivityBooking)
        .where(ActivityBooking.id == booking_id, ActivityBooking.business_context == BUSINESS_CONTEXT)
        .options(selectinload(ActivityBooking.participants), selectinload(ActivityBooking.history))
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return _enrich_booking(b, db)


@router.post("/bookings", status_code=201)
def create_booking(
    data: BookingCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    # Load activity
    activity = db.scalar(
        select(Activity).where(
            Activity.id == data.activity_id,
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.status == "Active",
            Activity.is_deleted.is_(False),
        )
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Active activity not found")

    # Validate customer
    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    booking_type = activity.booking_type
    total_amount = Decimal("0.00")
    unit_price = Decimal("0.00")

    # Pricing calculation
    if activity.is_complimentary or data.pricing_method == "complimentary":
        unit_price = Decimal("0.00")
        total_amount = Decimal("0.00")
    elif data.pricing_method == "per_group" and activity.price_per_group is not None:
        unit_price = activity.price_per_group
        total_amount = activity.price_per_group
    else:
        unit_price = activity.price_per_person or Decimal("0.00")
        total_amount = unit_price * data.participant_count

    # Booking type–specific validation
    if booking_type == "session":
        if not data.session_id:
            raise HTTPException(status_code=422, detail="session_id is required for session booking type.")

        # Acquire with row lock to prevent double-booking
        session = db.execute(
            select(ActivitySession).where(ActivitySession.id == data.session_id).with_for_update()
        ).scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.activity_id != data.activity_id:
            raise HTTPException(status_code=422, detail="Session does not belong to the selected activity.")
        if session.status not in ("Scheduled", "In Progress"):
            raise HTTPException(status_code=422, detail=f"Session is not available (status: {session.status}).")

        seats_booked = db.scalar(
            select(func.coalesce(func.sum(ActivityBooking.participant_count), 0)).where(
                ActivityBooking.session_id == data.session_id,
                ActivityBooking.status.in_(["Pending", "Confirmed"]),
                ActivityBooking.is_deleted.is_(False),
            )
        ) or 0
        if seats_booked + data.participant_count > session.capacity:
            raise HTTPException(
                status_code=409,
                detail=f"Not enough capacity. {session.capacity - seats_booked} seat(s) remaining."
            )

    elif booking_type == "time_slot":
        if not data.resource_id or not data.slot_date or not data.slot_start_time or not data.slot_end_time:
            raise HTTPException(
                status_code=422,
                detail="resource_id, slot_date, slot_start_time, slot_end_time required for time_slot booking."
            )
        resource = db.get(ActivityResource, data.resource_id)
        if not resource or not resource.is_active:
            raise HTTPException(status_code=404, detail="Active resource not found")
        if resource.activity_id != data.activity_id:
            raise HTTPException(status_code=422, detail="Resource does not belong to the selected activity.")

        start_t = _parse_time(data.slot_start_time)
        end_t = _parse_time(data.slot_end_time)
        if end_t <= start_t:
            raise HTTPException(status_code=422, detail="slot_end_time must be after slot_start_time.")

        # Check resource overlap with row lock
        conflict = db.execute(
            select(ActivityBooking).where(
                ActivityBooking.resource_id == data.resource_id,
                ActivityBooking.slot_date == data.slot_date,
                ActivityBooking.status.in_(["Pending", "Confirmed"]),
                ActivityBooking.is_deleted.is_(False),
                ActivityBooking.slot_start_time < end_t,
                ActivityBooking.slot_end_time > start_t,
            ).with_for_update()
        ).scalar_one_or_none()
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"Resource already booked during the requested time slot (Booking: {conflict.booking_number})."
            )

    elif booking_type == "walk_in":
        # Walk-in: no advance session, just log usage
        pass

    # Validate participants count vs activity limits
    if data.participant_count < activity.min_participants:
        raise HTTPException(
            status_code=422,
            detail=f"Minimum {activity.min_participants} participant(s) required."
        )
    if data.participant_count > activity.max_participants:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum {activity.max_participants} participant(s) allowed."
        )

    # Age validation for provided participants
    for p in data.participants:
        if p.age is not None:
            if activity.min_age is not None and p.age < activity.min_age:
                raise HTTPException(
                    status_code=422,
                    detail=f"Participant '{p.participant_name}' is below the minimum age of {activity.min_age}."
                )
            if activity.max_age is not None and p.age > activity.max_age:
                raise HTTPException(
                    status_code=422,
                    detail=f"Participant '{p.participant_name}' exceeds the maximum age of {activity.max_age}."
                )

    # Create booking
    booking = ActivityBooking(
        business_context=BUSINESS_CONTEXT,
        activity_id=data.activity_id,
        customer_id=data.customer_id,
        session_id=data.session_id,
        resource_id=data.resource_id,
        booking_date=data.booking_date,
        slot_date=data.slot_date,
        slot_start_time=_parse_time(data.slot_start_time) if data.slot_start_time else None,
        slot_end_time=_parse_time(data.slot_end_time) if data.slot_end_time else None,
        participant_count=data.participant_count,
        booking_type_snapshot=booking_type,
        activity_name_snapshot=activity.name,
        pricing_method=data.pricing_method,
        unit_price_snapshot=unit_price,
        total_amount=total_amount,
        status="Pending",
        notes=data.notes,
        package_booking_id=data.package_booking_id,
        stay_reference=data.stay_reference,
        source_identifier="ACTIVITY_BOOKING",
        created_by=current_user.id,
    )
    db.add(booking)
    db.flush()  # get booking.id

    if len(data.participants) > data.participant_count:
        raise HTTPException(
            status_code=422,
            detail="Participant detail count cannot exceed participant_count.",
        )

    # Create participants (populate primary customer entry if none supplied)
    participants_to_create = list(data.participants)
    if not participants_to_create and booking_type in ("session", "time_slot"):
        participants_to_create = [
            type(
                "_DefaultPart",
                (),
                {
                    "participant_name": customer.full_name,
                    "age": None,
                    "waiver_signed": not activity.requires_waiver,
                    "notes": None,
                },
            )()
        ]

    for p in participants_to_create:
        participant = ActivityParticipant(
            booking_id=booking.id,
            participant_name=p.participant_name,
            age=p.age,
            waiver_signed=p.waiver_signed,
            notes=p.notes,
        )
        db.add(participant)

    # Booking history
    history = ActivityBookingHistory(
        booking_id=booking.id,
        action="CREATED",
        previous_status=None,
        new_status="Pending",
        changed_by=current_user.id,
    )
    db.add(history)

    try:
        db.commit()
        db.refresh(booking)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"id": booking.id, "booking_number": booking.booking_number, "message": "Booking created successfully."}


@router.patch("/bookings/{booking_id}/status")
def update_booking_status(
    booking_id: int,
    data: BookingStatusUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    b = db.scalar(
        select(ActivityBooking).where(
            ActivityBooking.id == booking_id, ActivityBooking.business_context == BUSINESS_CONTEXT
        )
    )
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")

    allowed = VALID_TRANSITIONS.get(b.status, set())
    if data.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{b.status}' to '{data.status}'. Allowed: {list(allowed)}"
        )

    # Waiver check before completing
    if data.status == "Completed":
        activity = db.get(Activity, b.activity_id)
        if activity and activity.requires_waiver:
            unsigned = db.scalar(
                select(func.count(ActivityParticipant.id)).where(
                    ActivityParticipant.booking_id == booking_id,
                    ActivityParticipant.waiver_signed.is_(False),
                )
            ) or 0
            if unsigned > 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"{unsigned} participant(s) have not signed the required waiver."
                )

    old_status = b.status
    b.status = data.status
    if data.status == "Cancelled":
        b.cancellation_reason = data.reason
        b.cancelled_at = get_kolkata_now()

    history = ActivityBookingHistory(
        booking_id=booking_id,
        action="STATUS_CHANGE",
        previous_status=old_status,
        new_status=data.status,
        reason=data.reason,
        changed_by=current_user.id,
    )
    db.add(history)
    db.commit()
    return {"message": f"Booking status updated to {data.status}"}


@router.delete("/bookings/{booking_id}")
def delete_booking(
    booking_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    b = db.scalar(
        select(ActivityBooking).where(
            ActivityBooking.id == booking_id,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
        )
    )
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking_number = b.booking_number
    _purge_activity_bookings(db, [booking_id])
    db.commit()
    return {"message": f"Booking {booking_number} and linked records cleared."}


@router.post("/bookings/bulk-delete")
def bulk_delete_bookings(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    unique_ids = list(dict.fromkeys(data.ids))
    rows = db.execute(
        select(ActivityBooking).where(
            ActivityBooking.id.in_(unique_ids),
            ActivityBooking.business_context == BUSINESS_CONTEXT,
        )
    ).scalars().all()
    found_ids = [r.id for r in rows]
    found_set = set(found_ids)
    failed = [
        {"id": bid, "name": f"Booking #{bid}", "reason": "Booking not found."}
        for bid in unique_ids
        if bid not in found_set
    ]
    _purge_activity_bookings(db, found_ids)
    db.commit()
    return {
        "deleted": len(found_ids),
        "failed": failed,
        "message": f"Cleared {len(found_ids)} booking(s).",
    }


@router.get("/bookings/{booking_id}/history")
def get_booking_history(
    booking_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ActivityBookingHistory)
        .where(ActivityBookingHistory.booking_id == booking_id)
        .order_by(ActivityBookingHistory.changed_at.desc())
    ).scalars().all()
    return [{"id": h.id, "action": h.action, "previous_status": h.previous_status,
             "new_status": h.new_status, "reason": h.reason, "changed_at": h.changed_at}
            for h in rows]


# ==========================================
# PARTICIPANTS (ROSTER)
# ==========================================

@router.get("/bookings/{booking_id}/participants")
def list_participants(
    booking_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ActivityParticipant).where(ActivityParticipant.booking_id == booking_id)
    ).scalars().all()
    return [
        {"id": p.id, "booking_id": p.booking_id, "participant_name": p.participant_name,
         "age": p.age, "waiver_signed": p.waiver_signed, "attendance_status": p.attendance_status,
         "notes": p.notes}
        for p in rows
    ]


@router.patch("/participants/{participant_id}")
def update_participant(
    participant_id: int,
    data: ParticipantUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    p = db.get(ActivityParticipant, participant_id)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    return {"message": "Participant updated."}


@router.post("/participants/bulk-update")
def bulk_update_participants(
    data: BulkParticipantUpdateRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    if data.waiver_signed is None and data.attendance_status is None:
        raise HTTPException(status_code=422, detail="Provide waiver_signed or attendance_status to update.")
    rows = db.execute(
        select(ActivityParticipant)
        .join(ActivityBooking, ActivityParticipant.booking_id == ActivityBooking.id)
        .where(
            ActivityParticipant.id.in_(list(dict.fromkeys(data.ids))),
            ActivityBooking.business_context == BUSINESS_CONTEXT,
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No matching participants found.")
    for p in rows:
        if data.waiver_signed is not None:
            p.waiver_signed = data.waiver_signed
        if data.attendance_status is not None:
            p.attendance_status = data.attendance_status
    db.commit()
    return {"updated": len(rows), "message": f"Updated {len(rows)} participant(s)."}


# Session Roster
@router.get("/sessions/{session_id}/roster")
def get_session_roster(
    session_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    session = db.execute(
        select(ActivitySession).where(ActivitySession.id == session_id).options(joinedload(ActivitySession.activity))
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    bookings = db.execute(
        select(ActivityBooking)
        .where(
            ActivityBooking.session_id == session_id,
            ActivityBooking.is_deleted.is_(False),
            ActivityBooking.status.in_(["Pending", "Confirmed", "Completed", "No Show"]),
        )
        .options(selectinload(ActivityBooking.participants))
    ).scalars().all()

    roster = []
    for b in bookings:
        customer = db.get(Customer, b.customer_id)
        # Invoice lookup
        invoice = db.scalar(
            select(Invoice).where(
                Invoice.source_module == BUSINESS_CONTEXT,
                Invoice.source_reference_id == b.id,
            )
        )
        for p in b.participants:
            roster.append({
                "participant_id": p.id,
                "participant_name": p.participant_name,
                "customer_name": customer.full_name if customer else "",
                "customer_phone": customer.phone if customer else "",
                "age": p.age,
                "booking_number": b.booking_number,
                "participant_count": b.participant_count,
                "waiver_signed": p.waiver_signed,
                "attendance_status": p.attendance_status,
                "booking_status": b.status,
                "payment_status": invoice.payment_status if invoice else "Pending",
                "total_amount": str(b.total_amount),
                "notes": p.notes,
            })

    session_data = _enrich_session(session, db)
    return {"session": session_data, "roster": roster}


# ==========================================
# WALK-IN USAGE LOGS
# ==========================================

@router.get("/usage-logs")
def list_usage_logs(
    activity_id: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = (
        select(ActivityUsageLog)
        .join(Activity, ActivityUsageLog.activity_id == Activity.id)
        .where(Activity.business_context == BUSINESS_CONTEXT)
    )
    if activity_id:
        q = q.where(ActivityUsageLog.activity_id == activity_id)
    if date_from:
        q = q.where(ActivityUsageLog.usage_date >= date_from)
    if date_to:
        q = q.where(ActivityUsageLog.usage_date <= date_to)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.order_by(ActivityUsageLog.usage_date.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()

    items = []
    for log in rows:
        activity = db.get(Activity, log.activity_id)
        customer = db.get(Customer, log.customer_id) if log.customer_id else None
        items.append({
            "id": log.id,
            "activity_id": log.activity_id,
            "activity_name": activity.name if activity else "",
            "customer_id": log.customer_id,
            "customer_name": customer.full_name if customer else None,
            "usage_date": log.usage_date,
            "usage_time": _serialize_time(log.usage_time),
            "participant_count": log.participant_count,
            "amount_charged": str(log.amount_charged),
            "notes": log.notes,
            "created_at": log.created_at,
        })

    total_pages = max(1, math.ceil(total / page_size))
    return {"total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": items}


@router.post("/usage-logs", status_code=201)
def create_usage_log(
    data: UsageLogCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    activity = db.scalar(
        select(Activity).where(
            Activity.id == data.activity_id,
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.booking_type == "walk_in",
            Activity.is_deleted.is_(False),
        )
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Walk-in activity not found")

    if data.participant_count < 1:
        raise HTTPException(status_code=422, detail="participant_count must be at least 1.")

    charge = data.amount_charged
    if charge == Decimal("0.00") and not activity.is_complimentary:
        if activity.price_per_person is not None:
            charge = money(activity.price_per_person * data.participant_count)
        elif activity.price_per_group is not None:
            charge = money(activity.price_per_group)

    log = ActivityUsageLog(
        activity_id=data.activity_id,
        customer_id=data.customer_id,
        usage_date=data.usage_date,
        usage_time=_parse_time(data.usage_time) if data.usage_time else None,
        participant_count=data.participant_count,
        amount_charged=charge,
        recorded_by=current_user.id,
        notes=data.notes,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "message": "Usage log created."}


@router.delete("/usage-logs/{log_id}")
def delete_usage_log(
    log_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    log = db.scalar(
        select(ActivityUsageLog)
        .join(Activity, ActivityUsageLog.activity_id == Activity.id)
        .where(ActivityUsageLog.id == log_id, Activity.business_context == BUSINESS_CONTEXT)
    )
    if not log:
        raise HTTPException(status_code=404, detail="Walk-in usage log not found")
    db.delete(log)
    db.commit()
    return {"message": "Walk-in usage log cleared."}


@router.post("/usage-logs/bulk-delete")
def bulk_delete_usage_logs(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    unique_ids = list(dict.fromkeys(data.ids))
    rows = db.execute(
        select(ActivityUsageLog)
        .join(Activity, ActivityUsageLog.activity_id == Activity.id)
        .where(ActivityUsageLog.id.in_(unique_ids), Activity.business_context == BUSINESS_CONTEXT)
    ).scalars().all()
    found_set = {r.id for r in rows}
    failed = [
        {"id": lid, "name": f"Log #{lid}", "reason": "Usage log not found."}
        for lid in unique_ids
        if lid not in found_set
    ]
    for r in rows:
        db.delete(r)
    db.commit()
    return {"deleted": len(rows), "failed": failed, "message": f"Cleared {len(rows)} walk-in log(s)."}


# ==========================================
# CUSTOMERS (master customer table)
# ==========================================

@router.get("/customers")
def list_customers(
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = select(Customer)
    if search:
        like = f"%{search}%"
        q = q.where(or_(Customer.full_name.ilike(like), Customer.phone.ilike(like), Customer.email.ilike(like)))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.order_by(Customer.full_name).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    items = []
    for c in rows:
        bk_count = db.scalar(
            select(func.count(ActivityBooking.id)).where(
                ActivityBooking.customer_id == c.id,
                ActivityBooking.business_context == BUSINESS_CONTEXT,
                ActivityBooking.is_deleted.is_(False),
            )
        ) or 0
        total_spend = db.scalar(
            select(func.coalesce(func.sum(ActivityBooking.total_amount), 0)).where(
                ActivityBooking.customer_id == c.id,
                ActivityBooking.business_context == BUSINESS_CONTEXT,
                ActivityBooking.is_deleted.is_(False),
                ActivityBooking.status != "Cancelled",
            )
        ) or Decimal("0.00")
        items.append({
            "id": c.id,
            "full_name": c.full_name,
            "phone": c.phone,
            "email": c.email,
            "address": c.address,
            "activity_bookings_count": bk_count,
            "activity_total_spend": str(money(total_spend)),
        })
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items,
    }


@router.get("/customers/{customer_id}")
def get_customer(
    customer_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    bookings = db.execute(
        select(ActivityBooking)
        .where(
            ActivityBooking.customer_id == customer_id,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
            ActivityBooking.is_deleted.is_(False),
        )
        .options(selectinload(ActivityBooking.participants), selectinload(ActivityBooking.history))
        .order_by(ActivityBooking.booking_date.desc())
        .limit(50)
    ).scalars().all()
    return {
        "id": c.id,
        "full_name": c.full_name,
        "phone": c.phone,
        "email": c.email,
        "address": c.address,
        "bookings": [_enrich_booking(b, db) for b in bookings],
    }


@router.post("/customers", status_code=201)
def create_customer(
    data: CustomerCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    c = Customer(full_name=data.full_name, phone=data.phone, email=data.email, address=data.address)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "message": "Customer created."}


@router.patch("/customers/{customer_id}")
def update_customer(
    customer_id: int,
    data: CustomerCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    c.full_name = data.full_name
    c.phone = data.phone
    c.email = data.email
    c.address = data.address
    db.commit()
    return {"message": "Customer updated."}


def _delete_customer_record(db: Session, c: Customer) -> None:
    act_bookings = db.scalar(
        select(func.count(ActivityBooking.id)).where(
            ActivityBooking.customer_id == c.id,
        )
    ) or 0
    rest_orders = db.scalar(select(func.count(Order.id)).where(Order.customer_id == c.id)) or 0
    invs = db.scalar(select(func.count(Invoice.id)).where(Invoice.customer_id == c.id)) or 0
    if act_bookings or rest_orders or invs:
        raise HTTPException(
            status_code=409,
            detail="Customer has linked bookings, invoices, or orders. Clear those records first.",
        )
    db.query(ActivityUsageLog).filter(ActivityUsageLog.customer_id == c.id).update(
        {"customer_id": None}, synchronize_session=False
    )
    db.delete(c)


@router.delete("/customers/{customer_id}")
def delete_customer(
    customer_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    _delete_customer_record(db, c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Customer is referenced by another module record and cannot be deleted.",
        )
    return {"message": "Customer removed."}


@router.post("/customers/bulk-delete")
def bulk_delete_customers(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    failed: list[dict[str, Any]] = []
    for customer_id in dict.fromkeys(data.ids):
        c = db.get(Customer, customer_id)
        if not c:
            failed.append({"id": customer_id, "name": f"Customer #{customer_id}", "reason": "Customer not found."})
            continue
        name = c.full_name
        try:
            with db.begin_nested():
                _delete_customer_record(db, c)
                db.flush()
            deleted += 1
        except HTTPException as exc:
            failed.append({"id": customer_id, "name": name, "reason": str(exc.detail)})
        except IntegrityError:
            failed.append({"id": customer_id, "name": name, "reason": "Customer is referenced by another record."})
    db.commit()
    return {"deleted": deleted, "failed": failed, "message": f"Deleted {deleted} customer(s)."}


# ==========================================
# INVOICES & PAYMENTS
# ==========================================

def _serialize_activity_invoice(inv: Invoice, db: Session) -> dict:
    customer = db.get(Customer, inv.customer_id) if inv.customer_id else None
    booking = db.get(ActivityBooking, inv.source_reference_id) if inv.source_reference_id else None
    payments = db.execute(
        select(Payment).where(Payment.invoice_id == inv.id, Payment.source_module == BUSINESS_CONTEXT).order_by(Payment.created_at)
    ).scalars().all()
    pay_status = getattr(inv.payment_status, "value", str(inv.payment_status))
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "source_module": inv.source_module,
        "source_reference_id": inv.source_reference_id,
        "source_reference_number": inv.source_reference_number,
        "booking_number": booking.booking_number if booking else inv.source_reference_number,
        "booking_status": booking.status if booking else None,
        "activity_name": booking.activity_name_snapshot if booking else None,
        "booking_type": booking.booking_type_snapshot if booking else None,
        "customer_id": inv.customer_id,
        "customer_name": customer.full_name if customer else "",
        "customer_phone": customer.phone if customer else None,
        "customer_email": customer.email if customer else None,
        "subtotal": str(inv.subtotal),
        "gst_rate": str(inv.gst_rate),
        "gst_amount": str(inv.gst_amount),
        "total_amount": str(inv.total_amount),
        "paid_amount": str(inv.paid_amount),
        "balance_due": str(inv.balance_due),
        "payment_status": pay_status,
        "notes": inv.notes,
        "pdf_path": inv.pdf_path,
        "created_at": inv.created_at,
        "payments": [
            {
                "id": p.id,
                "amount": str(p.amount),
                "payment_method": getattr(p.payment_method, "value", str(p.payment_method)),
                "reference_number": p.reference_number,
                "payment_type": p.payment_type,
                "status": getattr(p.status, "value", str(p.status)),
                "paid_at": p.paid_at,
            }
            for p in payments
        ],
    }


@router.get("/invoices")
def list_invoices(
    search: str | None = None,
    booking_id: int | None = None,
    payment_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    q = (
        select(Invoice)
        .outerjoin(Customer, Invoice.customer_id == Customer.id)
        .where(Invoice.source_module == BUSINESS_CONTEXT)
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.where(
            or_(
                Invoice.invoice_number.ilike(like),
                Invoice.source_reference_number.ilike(like),
                Customer.full_name.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    if booking_id:
        q = q.where(Invoice.source_reference_id == booking_id)
    if payment_status:
        q = q.where(Invoice.payment_status == payment_status)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.order_by(Invoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    items = [_serialize_activity_invoice(inv, db) for inv in rows]
    total_pages = max(1, math.ceil(total / page_size))
    return {"total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": items}


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _serialize_activity_invoice(inv, db)


@router.get("/invoices/{invoice_id}/payments")
def get_invoice_payments(
    invoice_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    sync_activity_invoice_financials(db, inv)
    db.commit()
    return _serialize_activity_invoice(inv, db)


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pdf_path = generate_activity_invoice_pdf(db, inv)
    db.commit()
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{inv.invoice_number}.pdf",
    )


@router.post("/invoices", status_code=201)
def create_invoice(
    data: ActivityInvoiceCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    booking = db.scalar(
        select(ActivityBooking).where(
            ActivityBooking.id == data.booking_id,
            ActivityBooking.business_context == BUSINESS_CONTEXT,
        )
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    existing = db.scalar(
        select(Invoice).where(
            Invoice.source_module == BUSINESS_CONTEXT,
            Invoice.source_reference_id == data.booking_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Invoice already exists: {existing.invoice_number}")

    subtotal = money(booking.total_amount)
    gst_rate = money(data.gst_rate)
    gst_amount = money(subtotal * gst_rate / Decimal("100"))
    total_amount = money(subtotal + gst_amount)

    inv = Invoice(
        source_module=BUSINESS_CONTEXT,
        source_reference_id=booking.id,
        source_reference_number=booking.booking_number,
        customer_id=booking.customer_id,
        subtotal=subtotal,
        gst_rate=gst_rate,
        gst_amount=gst_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        balance_due=total_amount,
        payment_status=PaymentStatus.PAID if total_amount == Decimal("0.00") else PaymentStatus.PENDING,
        notes=data.notes,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _serialize_activity_invoice(inv, db)


def _delete_invoice_record(db: Session, inv: Invoice) -> str:
    payment_count = db.scalar(
        select(func.count(Payment.id)).where(
            Payment.invoice_id == inv.id,
            Payment.source_module == BUSINESS_CONTEXT,
        )
    ) or 0
    if payment_count or inv.payment_status != PaymentStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail="Invoices with recorded payments or settled status cannot be deleted.",
        )
    inv_num = inv.invoice_number
    db.delete(inv)
    return inv_num


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv_num = _delete_invoice_record(db, inv)
    db.commit()
    return {"message": f"Invoice {inv_num} cleared."}


@router.post("/invoices/bulk-delete")
def bulk_delete_invoices(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    failed: list[dict[str, Any]] = []
    for invoice_id in dict.fromkeys(data.ids):
        inv = db.scalar(
            select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT)
        )
        if not inv:
            failed.append({"id": invoice_id, "name": f"Invoice #{invoice_id}", "reason": "Invoice not found."})
            continue
        inv_num = inv.invoice_number
        try:
            _delete_invoice_record(db, inv)
            db.flush()
            deleted += 1
        except HTTPException as exc:
            failed.append({"id": invoice_id, "name": inv_num, "reason": str(exc.detail)})
    db.commit()
    return {"deleted": deleted, "failed": failed, "message": f"Cleared {deleted} invoice(s)."}


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: int,
    data: PaymentCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    amt = money(data.amount)
    if amt <= 0:
        raise HTTPException(status_code=422, detail="Payment amount must be positive.")
    if amt > money(inv.balance_due):
        raise HTTPException(status_code=422, detail=f"Payment amount exceeds balance due: ₹{inv.balance_due}")

    pm = PAYMENT_METHOD_ENUM_MAP.get(data.payment_method)
    if pm is None:
        try:
            pm = PaymentMethod(data.payment_method)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid payment method: {data.payment_method}")

    payment = Payment(
        invoice_id=invoice_id,
        payment_method=pm,
        amount=amt,
        status=PaymentStatus.PAID,
        reference_number=data.reference_number,
        payment_type=data.payment_type,
        paid_at=get_kolkata_now(),
        source_module=BUSINESS_CONTEXT,
        received_by=current_user.id,
    )
    db.add(payment)
    db.flush()
    db.refresh(inv)
    sync_activity_invoice_financials(db, inv)
    db.commit()
    return {
        "message": "Payment recorded.",
        "invoice": _serialize_activity_invoice(inv, db),
    }


# ==========================================
# ACTIVITY MEDIA
# ==========================================

@router.get("/activities/{activity_id}/media")
def list_activity_media(
    activity_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ActivityMedia)
        .where(ActivityMedia.activity_id == activity_id)
        .order_by(ActivityMedia.sort_order, ActivityMedia.id)
    ).scalars().all()
    return [_serialize_media(m) for m in rows]


@router.post("/activities/{activity_id}/media", status_code=201)
async def upload_activity_media(
    activity_id: int,
    file: UploadFile = File(...),
    media_type: str = Form("gallery"),
    caption: str = Form(""),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    a = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.business_context == BUSINESS_CONTEXT))
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")

    content, normalized_mime, file_size, checksum = await validate_image_file(file)

    existing = db.scalar(
        select(ActivityMedia).where(ActivityMedia.activity_id == activity_id, ActivityMedia.checksum == checksum)
    )
    if existing:
        raise HTTPException(status_code=409, detail="This image is already attached to this activity.")

    max_order = db.scalar(
        select(func.coalesce(func.max(ActivityMedia.sort_order), -1)).where(ActivityMedia.activity_id == activity_id)
    ) or -1

    mtype = media_type if media_type in ("cover", "gallery") else "gallery"
    media = ActivityMedia(
        activity_id=activity_id,
        media_type=mtype,
        image_data=content,
        mime_type=normalized_mime,
        file_size=file_size,
        checksum=checksum,
        file_name=file.filename,
        caption=caption.strip() or None,
        sort_order=0 if mtype == "cover" else max_order + 1,
    )
    db.add(media)
    db.flush()
    if mtype == "cover" or not a.cover_image_url:
        a.cover_image_url = f"/api/activities/media/{media.id}/image"
    db.commit()
    db.refresh(media)
    return _serialize_media(media)


@router.get("/media/{media_id}/image")
def get_activity_media_image(
    media_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    m = db.get(ActivityMedia, media_id)
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")
    return StreamingResponse(io.BytesIO(m.image_data), media_type=m.mime_type)


@router.delete("/media/{media_id}")
def delete_activity_media(
    media_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    m = db.get(ActivityMedia, media_id)
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")
    act = db.get(Activity, m.activity_id)
    db.delete(m)
    db.flush()
    if act:
        remaining = db.execute(
            select(ActivityMedia).where(ActivityMedia.activity_id == act.id).order_by(ActivityMedia.sort_order, ActivityMedia.id)
        ).scalars().all()
        if remaining:
            cover_item = next((rm for rm in remaining if rm.media_type == "cover"), remaining[0])
            act.cover_image_url = f"/api/activities/media/{cover_item.id}/image"
        else:
            act.cover_image_url = None
    db.commit()
    return {"message": "Media deleted."}


# ==========================================
# STAFF / INSTRUCTORS (activity-linked)
# ==========================================

def _serialize_activity_staff(u: User, st: Staff | None, db: Session, *, target_activity_id: int | None = None) -> dict:
    assigns = db.execute(
        select(ActivityInstructorAssignment, Activity)
        .join(Activity, ActivityInstructorAssignment.activity_id == Activity.id)
        .where(
            ActivityInstructorAssignment.staff_user_id == u.id,
            Activity.business_context == BUSINESS_CONTEXT,
            Activity.is_deleted.is_(False),
        )
        .order_by(Activity.name)
    ).all()
    today = get_kolkata_today()
    upcoming_sessions = db.scalar(
        select(func.count(ActivitySession.id))
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivitySession.assigned_staff_id == u.id,
            ActivitySession.session_date >= today,
            ActivitySession.status.in_(["Scheduled", "In Progress"]),
        )
    ) or 0
    assigned_ids = [act.id for _, act in assigns]
    return {
        "id": u.id,
        "staff_id": st.id if st else None,
        "full_name": u.full_name,
        "email": u.email,
        "role": str(getattr(u.role, "value", u.role)),
        "is_active": u.is_active,
        "employee_code": st.employee_code if st else None,
        "phone": st.phone if st else "",
        "designation": st.designation if st else "Activity Instructor",
        "assigned_activity_ids": assigned_ids,
        "assigned_activities": [
            {"id": act.id, "name": act.name, "category": act.category}
            for _, act in assigns
        ],
        "is_assigned_to_activity": target_activity_id in assigned_ids if target_activity_id else False,
        "upcoming_session_count": upcoming_sessions,
    }


@router.get("/staff")
def list_staff(
    search: str | None = None,
    activity_id: int | None = None,
    assigned_only: bool = False,
    include_inactive: bool = False,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    """List activity instructors & coordinators, optionally filtered/prioritized by activity."""
    q = (
        select(User, Staff)
        .outerjoin(Staff, Staff.user_id == User.id)
        .where(User.business_context == BUSINESS_CONTEXT)
    )
    if not include_inactive:
        q = q.where(User.is_active.is_(True))
    if search:
        like = f"%{search.strip()}%"
        q = q.where(
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                Staff.employee_code.ilike(like),
                Staff.phone.ilike(like),
                Staff.designation.ilike(like),
            )
        )
    rows = db.execute(q.order_by(User.full_name).limit(200)).all()
    items = [
        _serialize_activity_staff(u, st, db, target_activity_id=activity_id)
        for u, st in rows
    ]
    if activity_id:
        if assigned_only:
            items = [i for i in items if i["is_assigned_to_activity"]]
        else:
            items.sort(key=lambda x: (not x["is_assigned_to_activity"], x["full_name"].lower()))
    return items


@router.post("/staff", status_code=201)
def create_staff_member(
    data: ActivityStaffCreate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(status_code=409, detail="Email address is already registered.")

    emp_code = (data.employee_code or "").strip().upper()
    if not emp_code:
        emp_code = f"ACT-{secrets.token_hex(3).upper()}"
    if db.scalar(select(Staff).where(Staff.employee_code == emp_code)):
        raise HTTPException(status_code=409, detail=f"Employee code '{emp_code}' already exists.")

    new_user = User(
        full_name=data.full_name,
        email=data.email,
        password_hash=hash_password(secrets.token_urlsafe(24)),
        role=UserRole.STAFF,
        business_context=BUSINESS_CONTEXT,
        is_active=data.is_active,
    )
    db.add(new_user)
    db.flush()

    st = Staff(
        user_id=new_user.id,
        employee_code=emp_code,
        phone=data.phone,
        designation=(data.designation or "Activity Instructor").strip(),
    )
    db.add(st)
    _sync_staff_activities(db, new_user.id, data.activity_ids)
    db.commit()
    db.refresh(new_user)
    db.refresh(st)
    return _serialize_activity_staff(new_user, st, db)


@router.patch("/staff/{user_id}")
def update_staff_member(
    user_id: int,
    data: ActivityStaffUpdate,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    u = db.scalar(select(User).where(User.id == user_id, User.business_context == BUSINESS_CONTEXT))
    if not u:
        raise HTTPException(status_code=404, detail="Instructor / staff member not found")

    st = db.scalar(select(Staff).where(Staff.user_id == user_id))
    if data.email and data.email.lower() != u.email.lower():
        if db.scalar(select(User).where(func.lower(User.email) == data.email.lower(), User.id != user_id)):
            raise HTTPException(status_code=409, detail="Email address is already in use.")
        u.email = data.email

    if data.full_name is not None:
        cleaned = data.full_name.strip()
        if len(cleaned) < 2:
            raise HTTPException(status_code=422, detail="Full name must be at least 2 characters.")
        u.full_name = cleaned

    if data.is_active is not None:
        if user_id == current_user.id and not data.is_active:
            raise HTTPException(status_code=409, detail="Cannot deactivate the currently logged-in manager.")
        u.is_active = data.is_active

    emp_code = data.employee_code.strip().upper() if data.employee_code else (st.employee_code if st else f"ACT-{secrets.token_hex(3).upper()}")
    if st:
        if emp_code != st.employee_code and db.scalar(select(Staff).where(Staff.employee_code == emp_code, Staff.id != st.id)):
            raise HTTPException(status_code=409, detail=f"Employee code '{emp_code}' already exists.")
        st.employee_code = emp_code
        if data.phone is not None:
            st.phone = data.phone.strip()
        if data.designation is not None:
            st.designation = data.designation.strip() or "Activity Instructor"
    else:
        if db.scalar(select(Staff).where(Staff.employee_code == emp_code)):
            emp_code = f"ACT-{secrets.token_hex(3).upper()}"
        st = Staff(
            user_id=u.id,
            employee_code=emp_code,
            phone=(data.phone or "").strip() or "0000000000",
            designation=(data.designation or "Activity Instructor").strip(),
        )
        db.add(st)

    if data.activity_ids is not None:
        _sync_staff_activities(db, u.id, data.activity_ids)

    db.commit()
    db.refresh(u)
    db.refresh(st)
    return _serialize_activity_staff(u, st, db)


def _delete_staff_record(db: Session, u: User, current_user_id: int) -> None:
    role_val = str(getattr(u.role, "value", u.role)).lower()
    if u.id == current_user_id or role_val == "manager":
        raise HTTPException(status_code=409, detail="Manager account cannot be deleted.")

    today = get_kolkata_today()
    active_sessions = db.scalar(
        select(func.count(ActivitySession.id))
        .join(Activity, ActivitySession.activity_id == Activity.id)
        .where(
            Activity.business_context == BUSINESS_CONTEXT,
            ActivitySession.assigned_staff_id == u.id,
            ActivitySession.session_date >= today,
            ActivitySession.status.in_(["Scheduled", "In Progress"]),
        )
    ) or 0
    if active_sessions > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Instructor has {active_sessions} upcoming/active session(s). Reassign or clear them first.",
        )

    db.query(ActivityInstructorAssignment).filter(
        ActivityInstructorAssignment.staff_user_id == u.id
    ).delete(synchronize_session=False)
    db.query(Activity).filter(Activity.default_staff_id == u.id).update({"default_staff_id": None}, synchronize_session=False)
    db.query(ActivitySchedule).filter(ActivitySchedule.default_staff_id == u.id).update({"default_staff_id": None}, synchronize_session=False)
    db.query(ActivitySession).filter(ActivitySession.assigned_staff_id == u.id).update({"assigned_staff_id": None}, synchronize_session=False)
    db.query(Staff).filter(Staff.user_id == u.id).delete(synchronize_session=False)
    db.delete(u)


@router.delete("/staff/{user_id}")
def delete_staff_member(
    user_id: int,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    u = db.scalar(select(User).where(User.id == user_id, User.business_context == BUSINESS_CONTEXT))
    if not u:
        raise HTTPException(status_code=404, detail="Instructor / staff member not found")
    name = u.full_name
    _delete_staff_record(db, u, current_user.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Instructor has historical references and cannot be removed. Deactivate instead.")
    return {"message": f"Instructor '{name}' removed."}


@router.post("/staff/bulk-delete")
def bulk_delete_staff(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    deleted = 0
    failed: list[dict[str, Any]] = []
    for uid in dict.fromkeys(data.ids):
        u = db.scalar(select(User).where(User.id == uid, User.business_context == BUSINESS_CONTEXT))
        if not u:
            failed.append({"id": uid, "name": f"Staff #{uid}", "reason": "Instructor not found."})
            continue
        name = u.full_name
        try:
            with db.begin_nested():
                _delete_staff_record(db, u, current_user.id)
                db.flush()
            deleted += 1
        except HTTPException as exc:
            failed.append({"id": uid, "name": name, "reason": str(exc.detail)})
        except IntegrityError:
            failed.append({"id": uid, "name": name, "reason": "Instructor has historical references."})
    db.commit()
    return {"deleted": deleted, "failed": failed, "message": f"Deleted {deleted} instructor(s)."}


# ==========================================
# REPORTS
# ==========================================

@router.get("/reports")
def get_reports(
    report_type: str = "bookings",
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    activity_id: int | None = None,
    category: str | None = None,
    booking_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    # Global KPI summary for the filter window
    bk_summary_q = select(ActivityBooking).join(Activity, ActivityBooking.activity_id == Activity.id).where(
        ActivityBooking.business_context == BUSINESS_CONTEXT,
        ActivityBooking.is_deleted.is_(False),
    )
    if date_from:
        bk_summary_q = bk_summary_q.where(ActivityBooking.booking_date >= date_from)
    if date_to:
        bk_summary_q = bk_summary_q.where(ActivityBooking.booking_date <= date_to)
    if activity_id:
        bk_summary_q = bk_summary_q.where(ActivityBooking.activity_id == activity_id)
    if category:
        bk_summary_q = bk_summary_q.where(Activity.category == category)
    if booking_type:
        bk_summary_q = bk_summary_q.where(ActivityBooking.booking_type_snapshot == booking_type)
    if status:
        bk_summary_q = bk_summary_q.where(ActivityBooking.status == status)

    all_bk = db.execute(bk_summary_q).scalars().all()
    total_booked_value = sum((money(b.total_amount) for b in all_bk if b.status != "Cancelled"), Decimal("0.00"))
    cancelled_bookings = sum(1 for b in all_bk if b.status == "Cancelled")
    total_participants = sum(b.participant_count for b in all_bk if b.status != "Cancelled")

    inv_q = select(Invoice).where(Invoice.source_module == BUSINESS_CONTEXT)
    if date_from:
        inv_q = inv_q.where(func.date(Invoice.created_at) >= date_from)
    if date_to:
        inv_q = inv_q.where(func.date(Invoice.created_at) <= date_to)
    inv_rows = db.execute(inv_q).scalars().all()
    total_collected = sum((money(i.paid_amount) for i in inv_rows), Decimal("0.00"))
    total_outstanding = sum((money(i.balance_due) for i in inv_rows), Decimal("0.00"))

    summary = {
        "total_bookings": len(all_bk),
        "active_bookings": len(all_bk) - cancelled_bookings,
        "cancelled_bookings": cancelled_bookings,
        "total_participants": total_participants,
        "total_booked_value": str(money(total_booked_value)),
        "revenue_collected": str(money(total_collected)),
        "outstanding_balance": str(money(total_outstanding)),
    }

    if report_type == "sessions":
        q = (
            select(ActivitySession)
            .join(Activity, ActivitySession.activity_id == Activity.id)
            .where(Activity.business_context == BUSINESS_CONTEXT)
        )
        if date_from:
            q = q.where(ActivitySession.session_date >= date_from)
        if date_to:
            q = q.where(ActivitySession.session_date <= date_to)
        if activity_id:
            q = q.where(ActivitySession.activity_id == activity_id)
        if category:
            q = q.where(Activity.category == category)
        if status:
            q = q.where(ActivitySession.status == status)
        total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
        rows = db.execute(
            q.options(joinedload(ActivitySession.activity))
            .order_by(ActivitySession.session_date.desc(), ActivitySession.start_time)
            .offset((page - 1) * page_size).limit(page_size)
        ).scalars().all()
        total_pages = max(1, math.ceil(total / page_size))
        return {"summary": summary, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": [_enrich_session(s, db) for s in rows]}

    elif report_type == "usage":
        q = (
            select(ActivityUsageLog)
            .join(Activity, ActivityUsageLog.activity_id == Activity.id)
            .where(Activity.business_context == BUSINESS_CONTEXT)
        )
        if date_from:
            q = q.where(ActivityUsageLog.usage_date >= date_from)
        if date_to:
            q = q.where(ActivityUsageLog.usage_date <= date_to)
        if activity_id:
            q = q.where(ActivityUsageLog.activity_id == activity_id)
        if category:
            q = q.where(Activity.category == category)
        total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
        rows = db.execute(q.order_by(ActivityUsageLog.usage_date.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
        items = []
        for log in rows:
            act = db.get(Activity, log.activity_id)
            cust = db.get(Customer, log.customer_id) if log.customer_id else None
            items.append({
                "id": log.id,
                "activity_name": act.name if act else "",
                "category": act.category if act else "",
                "customer_name": cust.full_name if cust else "Walk-in Guest",
                "usage_date": log.usage_date,
                "usage_time": _serialize_time(log.usage_time),
                "participant_count": log.participant_count,
                "amount_charged": str(log.amount_charged),
                "notes": log.notes,
            })
        total_pages = max(1, math.ceil(total / page_size))
        return {"summary": summary, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages, "items": items}

    elif report_type == "revenue":
        total = len(inv_rows)
        start = (page - 1) * page_size
        page_invs = sorted(inv_rows, key=lambda x: x.created_at, reverse=True)[start:start + page_size]
        total_pages = max(1, math.ceil(total / page_size))
        return {
            "summary": summary,
            "total": total,
            "total_records": total,
            "total_revenue": str(money(total_collected)),
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "items": [_serialize_activity_invoice(inv, db) for inv in page_invs],
        }

    else:
        q = (
            select(ActivityBooking)
            .join(Activity, ActivityBooking.activity_id == Activity.id)
            .outerjoin(Customer, ActivityBooking.customer_id == Customer.id)
            .where(
                ActivityBooking.business_context == BUSINESS_CONTEXT,
                ActivityBooking.is_deleted.is_(False),
            )
        )
        if date_from:
            q = q.where(ActivityBooking.booking_date >= date_from)
        if date_to:
            q = q.where(ActivityBooking.booking_date <= date_to)
        if activity_id:
            q = q.where(ActivityBooking.activity_id == activity_id)
        if category:
            q = q.where(Activity.category == category)
        if booking_type:
            q = q.where(ActivityBooking.booking_type_snapshot == booking_type)
        if status:
            q = q.where(ActivityBooking.status == status)
        if search:
            like = f"%{search.strip()}%"
            q = q.where(
                or_(
                    ActivityBooking.booking_number.ilike(like),
                    ActivityBooking.activity_name_snapshot.ilike(like),
                    Customer.full_name.ilike(like),
                )
            )
        total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
        rows = db.execute(
            q.options(selectinload(ActivityBooking.participants), selectinload(ActivityBooking.history))
            .order_by(ActivityBooking.booking_date.desc(), ActivityBooking.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        ).scalars().all()
        total_pages = max(1, math.ceil(total / page_size))
        return {
            "summary": summary,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "items": [_enrich_booking(b, db) for b in rows],
        }


@router.get("/reports/export")
def export_reports_csv(
    report_type: str = "bookings",
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    activity_id: int | None = None,
    category: str | None = None,
    booking_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    current_user: User = Depends(require_activity_context),
    db: Session = Depends(get_db),
):
    report = get_reports(
        report_type=report_type,
        date_from=date_from,
        date_to=date_to,
        activity_id=activity_id,
        category=category,
        booking_type=booking_type,
        status=status,
        search=search,
        page=1,
        page_size=200,
        current_user=current_user,
        db=db,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    items = report.get("items", [])

    if report_type == "sessions":
        writer.writerow(["ID", "Activity", "Category", "Date", "Start", "End", "Instructor", "Seats Booked", "Capacity", "Status"])
        for r in items:
            writer.writerow([r["id"], r["activity_name"], r["activity_category"], r["session_date"], r["start_time"], r["end_time"], r.get("assigned_staff_name") or "Unassigned", r["seats_booked"], r["capacity"], r["status"]])
    elif report_type == "usage":
        writer.writerow(["ID", "Activity", "Category", "Guest", "Date", "Time", "Participants", "Amount Charged", "Notes"])
        for r in items:
            writer.writerow([r["id"], r["activity_name"], r["category"], r["customer_name"], r["usage_date"], r.get("usage_time") or "", r["participant_count"], r["amount_charged"], r.get("notes") or ""])
    elif report_type == "revenue":
        writer.writerow(["Invoice #", "Booking #", "Activity", "Customer", "Subtotal", "GST", "Total", "Paid", "Balance Due", "Payment Status"])
        for r in items:
            writer.writerow([r["invoice_number"], r.get("booking_number") or "", r.get("activity_name") or "", r["customer_name"], r["subtotal"], r["gst_amount"], r["total_amount"], r["paid_amount"], r["balance_due"], r["payment_status"]])
    else:
        writer.writerow(["Booking #", "Customer", "Phone", "Activity", "Category", "Type", "Date", "Participants", "Total Amount", "Status", "Payment Status"])
        for r in items:
            writer.writerow([r["booking_number"], r["customer_name"], r["customer_phone"], r["activity_name"], r["activity_category"], r["booking_type"], r["booking_date"], r["participant_count"], r["total_amount"], r["status"], r.get("payment_status") or "Pending"])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=activities-{report_type}-report.csv"},
    )
