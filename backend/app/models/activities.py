"""Activities module SQLAlchemy models."""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ==========================================
# TIMESTAMP MIXIN
# ==========================================

class ActTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ==========================================
# ENUMS
# ==========================================

class ActivityBookingType(str, Enum):
    TIME_SLOT = "time_slot"
    SESSION = "session"
    WALK_IN = "walk_in"


class ActivityStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"
    ARCHIVED = "Archived"


class ActivityCategory(str, Enum):
    WATER = "Water"
    ADVENTURE = "Adventure"
    INDOOR = "Indoor"
    OUTDOOR = "Outdoor"
    TOUR = "Tour"
    NATURE = "Nature"
    KIDS = "Kids"
    SPECIAL = "Special"


class SessionStatus(str, Enum):
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class ActivityBookingStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    NO_SHOW = "No Show"


class AttendanceStatus(str, Enum):
    PENDING = "Pending"
    PRESENT = "Present"
    ABSENT = "Absent"
    NO_SHOW = "No Show"


def generate_activity_booking_number() -> str:
    """Generate ACT-YYYY-NNNN style booking number."""
    import datetime as dt
    year = dt.datetime.now().year
    suffix = uuid4().hex[:6].upper()
    return f"ACT-{year}-{suffix}"


# ==========================================
# 1. ACTIVITIES
# ==========================================

class Activity(ActTimestampMixin, Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), nullable=False, default="ACTIVITY", server_default="ACTIVITY", index=True
    )
    activity_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Operational Details
    booking_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="session", server_default="session"
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60, server_default="60")
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_equipment: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    max_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    requires_waiver: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    default_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_complimentary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Pricing
    price_per_person: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    price_per_group: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Active", server_default="Active", index=True
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    resources: Mapped[list[ActivityResource]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    schedules: Mapped[list[ActivitySchedule]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    sessions: Mapped[list[ActivitySession]] = relationship(
        back_populates="activity"
    )
    bookings: Mapped[list[ActivityBooking]] = relationship(
        back_populates="activity"
    )
    media: Mapped[list[ActivityMedia]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    instructor_assignments: Mapped[list[ActivityInstructorAssignment]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("business_context", "activity_code", name="uq_activities_context_code"),
        CheckConstraint("duration_minutes > 0", name="ck_activities_duration_positive"),
        CheckConstraint("min_participants >= 1", name="ck_activities_min_participants"),
        CheckConstraint("max_participants >= min_participants", name="ck_activities_max_gte_min"),
    )


# ==========================================
# 2. ACTIVITY RESOURCES (for time_slot)
# ==========================================

class ActivityResource(ActTimestampMixin, Base):
    __tablename__ = "activity_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    activity: Mapped[Activity] = relationship(back_populates="resources")
    bookings: Mapped[list[ActivityBooking]] = relationship(back_populates="resource")


# ==========================================
# 3. ACTIVITY SCHEDULES (weekly template)
# ==========================================

class ActivitySchedule(ActTimestampMixin, Base):
    __tablename__ = "activity_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Weekdays as comma-separated ints 0=Mon...6=Sun
    operating_weekdays: Mapped[str] = mapped_column(String(30), nullable=False, default="0,1,2,3,4,5,6", server_default="0,1,2,3,4,5,6")
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date] = mapped_column(Date, nullable=False)
    default_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    default_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    activity: Mapped[Activity] = relationship(back_populates="schedules")

    __table_args__ = (
        CheckConstraint("valid_to >= valid_from", name="ck_act_schedules_dates_valid"),
        CheckConstraint("default_capacity >= 1", name="ck_act_schedules_capacity_positive"),
    )


# ==========================================
# 4. ACTIVITY SESSIONS
# ==========================================

class ActivitySession(ActTimestampMixin, Base):
    __tablename__ = "activity_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("activity_schedules.id", ondelete="SET NULL"), nullable=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Scheduled", server_default="Scheduled", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    activity: Mapped[Activity] = relationship(back_populates="sessions")
    bookings: Mapped[list[ActivityBooking]] = relationship(back_populates="session")

    __table_args__ = (
        CheckConstraint("capacity >= 1", name="ck_act_sessions_capacity_positive"),
        Index("ix_activity_sessions_date_activity", "session_date", "activity_id"),
    )


# ==========================================
# 5. ACTIVITY BOOKINGS
# ==========================================

class ActivityBooking(ActTimestampMixin, Base):
    __tablename__ = "activity_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), nullable=False, default="ACTIVITY", server_default="ACTIVITY", index=True
    )
    booking_number: Mapped[str] = mapped_column(
        String(30), nullable=False, unique=True,
        default=generate_activity_booking_number, index=True
    )
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Session reference (session booking)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("activity_sessions.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Resource reference (time slot booking)
    resource_id: Mapped[int | None] = mapped_column(
        ForeignKey("activity_resources.id", ondelete="RESTRICT"), nullable=True
    )

    booking_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # For time_slot: the actual reserved date/time
    slot_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    slot_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    slot_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    participant_count: Mapped[int] = mapped_column(Integer, nullable=False)
    booking_type_snapshot: Mapped[str] = mapped_column(String(30), nullable=False)
    activity_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    pricing_method: Mapped[str] = mapped_column(String(30), nullable=False, default="per_person", server_default="per_person")
    unit_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending", server_default="Pending", index=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Optional references
    package_booking_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stay_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_identifier: Mapped[str] = mapped_column(
        String(50), nullable=False, default="ACTIVITY_BOOKING", server_default="ACTIVITY_BOOKING"
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    activity: Mapped[Activity] = relationship(back_populates="bookings")
    session: Mapped[ActivitySession | None] = relationship(back_populates="bookings")
    resource: Mapped[ActivityResource | None] = relationship(back_populates="bookings")
    participants: Mapped[list[ActivityParticipant]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    history: Mapped[list[ActivityBookingHistory]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("participant_count >= 1", name="ck_act_bookings_participants_positive"),
        CheckConstraint("total_amount >= 0", name="ck_act_bookings_total_non_negative"),
        CheckConstraint("unit_price_snapshot >= 0", name="ck_act_bookings_unit_price_non_negative"),
    )


# ==========================================
# 6. ACTIVITY PARTICIPANTS
# ==========================================

class ActivityParticipant(ActTimestampMixin, Base):
    __tablename__ = "activity_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("activity_bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    waiver_signed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    attendance_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending", server_default="Pending"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    booking: Mapped[ActivityBooking] = relationship(back_populates="participants")


# ==========================================
# 7. ACTIVITY MEDIA
# ==========================================

class ActivityMedia(ActTimestampMixin, Base):
    __tablename__ = "activity_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    media_type: Mapped[str] = mapped_column(String(20), nullable=False, default="gallery", server_default="gallery")
    image_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    caption: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    activity: Mapped[Activity] = relationship(back_populates="media")


# ==========================================
# 8. ACTIVITY BOOKING HISTORY
# ==========================================

class ActivityBookingHistory(Base):
    __tablename__ = "activity_booking_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("activity_bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False, default="STATUS_CHANGE", server_default="STATUS_CHANGE")
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped[ActivityBooking] = relationship(back_populates="history")


# ==========================================
# 9. ACTIVITY USAGE LOGS (walk-in)
# ==========================================

class ActivityUsageLog(ActTimestampMixin, Base):
    __tablename__ = "activity_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    usage_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    usage_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    amount_charged: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    recorded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("participant_count >= 1", name="ck_act_usage_participants_positive"),
        CheckConstraint("amount_charged >= 0", name="ck_act_usage_amount_non_negative"),
    )


# ==========================================
# 10. ACTIVITY INSTRUCTOR ASSIGNMENTS
# ==========================================

class ActivityInstructorAssignment(ActTimestampMixin, Base):
    __tablename__ = "activity_instructor_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    staff_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    specialty_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    activity: Mapped[Activity] = relationship(back_populates="instructor_assignments")

    __table_args__ = (
        UniqueConstraint("staff_user_id", "activity_id", name="uq_act_instructor_activity"),
    )
