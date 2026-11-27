"""Pydantic schemas for the Activities module."""
from __future__ import annotations

import datetime
from decimal import Decimal
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_STRICT_EMAIL_REGEX = re.compile(
    r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$"
)


# ==========================================
# ACTIVITY CATEGORIES
# ==========================================

ACTIVITY_CATEGORIES = ["Water", "Adventure", "Indoor", "Outdoor", "Tour", "Nature", "Kids", "Special"]
BOOKING_TYPES = ["time_slot", "session", "walk_in"]
ACTIVITY_STATUSES = ["Active", "Inactive", "Archived"]
SESSION_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"]
BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled", "No Show"]
ATTENDANCE_STATUSES = ["Pending", "Present", "Absent", "No Show"]
PRICING_METHODS = ["per_person", "per_group", "complimentary"]


# ==========================================
# ACTIVITY SCHEMAS
# ==========================================

class ActivityBase(BaseModel):
    name: str
    activity_code: str
    category: str
    description: str | None = None
    location_name: str | None = None
    booking_type: str = "session"
    duration_minutes: int = 60
    safety_notes: str | None = None
    required_equipment: str | None = None
    min_participants: int = 1
    max_participants: int = 10
    min_age: int | None = None
    max_age: int | None = None
    requires_waiver: bool = False
    default_staff_id: int | None = None
    assigned_instructor_ids: list[int] | None = None
    is_complimentary: bool = False
    price_per_person: Decimal | None = None
    price_per_group: Decimal | None = None
    status: str = "Active"

    @field_validator("booking_type")
    @classmethod
    def validate_booking_type(cls, v: str) -> str:
        if v not in BOOKING_TYPES:
            raise ValueError(f"booking_type must be one of {BOOKING_TYPES}")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in ACTIVITY_CATEGORIES:
            raise ValueError(f"category must be one of {ACTIVITY_CATEGORIES}")
        return v

    @model_validator(mode="after")
    def validate_pricing(self) -> ActivityBase:
        if not self.is_complimentary:
            if self.price_per_person is None and self.price_per_group is None:
                raise ValueError("At least one of price_per_person or price_per_group must be set for non-complimentary activities.")
        return self


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    name: str | None = None
    activity_code: str | None = None
    category: str | None = None
    description: str | None = None
    location_name: str | None = None
    booking_type: str | None = None
    duration_minutes: int | None = None
    safety_notes: str | None = None
    required_equipment: str | None = None
    min_participants: int | None = None
    max_participants: int | None = None
    min_age: int | None = None
    max_age: int | None = None
    requires_waiver: bool | None = None
    default_staff_id: int | None = None
    assigned_instructor_ids: list[int] | None = None
    is_complimentary: bool | None = None
    price_per_person: Decimal | None = None
    price_per_group: Decimal | None = None
    status: str | None = None


class ActivityResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    name: str
    description: str | None = None
    capacity: int
    is_active: bool


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    business_context: str
    activity_code: str
    name: str
    category: str
    description: str | None = None
    location_name: str | None = None
    booking_type: str
    duration_minutes: int
    safety_notes: str | None = None
    required_equipment: str | None = None
    min_participants: int
    max_participants: int
    min_age: int | None = None
    max_age: int | None = None
    requires_waiver: bool
    default_staff_id: int | None = None
    is_complimentary: bool
    price_per_person: Decimal | None = None
    price_per_group: Decimal | None = None
    status: str
    cover_image_url: str | None = None
    is_deleted: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime
    resources: list[ActivityResourceOut] = []
    media_count: int = 0


# ==========================================
# RESOURCE SCHEMAS
# ==========================================

class ResourceCreate(BaseModel):
    name: str
    description: str | None = None
    capacity: int = 1
    is_active: bool = True


class ResourceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    capacity: int | None = None
    is_active: bool | None = None


# ==========================================
# SCHEDULE SCHEMAS
# ==========================================

class ScheduleCreate(BaseModel):
    activity_id: int
    operating_weekdays: list[int]  # 0=Mon...6=Sun
    start_time: str  # HH:MM
    end_time: str
    valid_from: datetime.date
    valid_to: datetime.date
    default_capacity: int = 10
    default_staff_id: int | None = None
    is_active: bool = True
    notes: str | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> ScheduleCreate:
        if self.valid_to < self.valid_from:
            raise ValueError("valid_to must be >= valid_from")
        return self


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    operating_weekdays: str
    start_time: Any
    end_time: Any
    valid_from: datetime.date
    valid_to: datetime.date
    default_capacity: int
    default_staff_id: int | None = None
    is_active: bool
    notes: str | None = None
    created_at: datetime.datetime


# ==========================================
# SESSION SCHEMAS
# ==========================================

class SessionCreate(BaseModel):
    activity_id: int
    schedule_id: int | None = None
    session_date: datetime.date
    start_time: str  # HH:MM
    end_time: str
    capacity: int
    assigned_staff_id: int | None = None
    notes: str | None = None


class SessionUpdate(BaseModel):
    session_date: datetime.date | None = None
    start_time: str | None = None
    end_time: str | None = None
    capacity: int | None = None
    assigned_staff_id: int | None = None
    status: str | None = None
    notes: str | None = None
    cancelled_reason: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    activity_name: str = ""
    activity_category: str = ""
    booking_type: str = ""
    schedule_id: int | None = None
    session_date: datetime.date
    start_time: Any
    end_time: Any
    capacity: int
    assigned_staff_id: int | None = None
    assigned_staff_name: str | None = None
    status: str
    notes: str | None = None
    cancelled_reason: str | None = None
    seats_booked: int = 0
    seats_remaining: int = 0
    is_full: bool = False
    created_at: datetime.datetime


# ==========================================
# BOOKING SCHEMAS
# ==========================================

class ParticipantCreate(BaseModel):
    participant_name: str
    age: int | None = None
    waiver_signed: bool = False
    notes: str | None = None


class ParticipantUpdate(BaseModel):
    participant_name: str | None = None
    age: int | None = None
    waiver_signed: bool | None = None
    attendance_status: str | None = None
    notes: str | None = None


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    booking_id: int
    participant_name: str
    age: int | None = None
    waiver_signed: bool
    attendance_status: str
    notes: str | None = None


class BookingCreate(BaseModel):
    activity_id: int
    customer_id: int
    session_id: int | None = None
    resource_id: int | None = None
    booking_date: datetime.date
    slot_date: datetime.date | None = None
    slot_start_time: str | None = None
    slot_end_time: str | None = None
    participant_count: int = 1
    pricing_method: str = "per_person"
    notes: str | None = None
    package_booking_id: int | None = None
    stay_reference: str | None = None
    participants: list[ParticipantCreate] = []

    @field_validator("pricing_method")
    @classmethod
    def validate_pricing_method(cls, v: str) -> str:
        if v not in PRICING_METHODS:
            raise ValueError(f"pricing_method must be one of {PRICING_METHODS}")
        return v


class BookingStatusUpdate(BaseModel):
    status: str
    reason: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in BOOKING_STATUSES:
            raise ValueError(f"status must be one of {BOOKING_STATUSES}")
        return v


class BookingHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    previous_status: str | None = None
    new_status: str
    reason: str | None = None
    changed_at: datetime.datetime


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    business_context: str
    booking_number: str
    activity_id: int
    activity_name: str = ""
    activity_category: str = ""
    booking_type: str = ""
    customer_id: int
    customer_name: str = ""
    customer_phone: str = ""
    session_id: int | None = None
    session_date: datetime.date | None = None
    session_start_time: Any = None
    resource_id: int | None = None
    resource_name: str | None = None
    booking_date: datetime.date
    slot_date: datetime.date | None = None
    slot_start_time: Any = None
    slot_end_time: Any = None
    participant_count: int
    booking_type_snapshot: str
    activity_name_snapshot: str
    pricing_method: str
    unit_price_snapshot: Decimal
    total_amount: Decimal
    status: str
    cancellation_reason: str | None = None
    cancelled_at: datetime.datetime | None = None
    package_booking_id: int | None = None
    stay_reference: str | None = None
    notes: str | None = None
    is_deleted: bool
    created_at: datetime.datetime
    participants: list[ParticipantOut] = []
    history: list[BookingHistoryOut] = []


# ==========================================
# USAGE LOG SCHEMAS (walk-in)
# ==========================================

class UsageLogCreate(BaseModel):
    activity_id: int
    customer_id: int | None = None
    usage_date: datetime.date
    usage_time: str | None = None  # HH:MM
    participant_count: int = 1
    amount_charged: Decimal = Decimal("0.00")
    notes: str | None = None


class UsageLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    activity_name: str = ""
    customer_id: int | None = None
    customer_name: str | None = None
    usage_date: datetime.date
    usage_time: Any = None
    participant_count: int
    amount_charged: Decimal
    notes: str | None = None
    created_at: datetime.datetime


# ==========================================
# DASHBOARD SCHEMAS
# ==========================================

class ActivityDashboardStats(BaseModel):
    total_activities: int = 0
    active_activities: int = 0
    sessions_today: int = 0
    bookings_today: int = 0
    upcoming_bookings: int = 0
    cancelled_today: int = 0
    total_participants_today: int = 0
    revenue_today: Decimal = Decimal("0.00")


class DashboardAlert(BaseModel):
    id: str
    severity: str = "warning"
    title: str
    message: str
    route: str | None = None


class ActivityDashboard(BaseModel):
    statistics: ActivityDashboardStats
    alerts: list[DashboardAlert] = []
    todays_sessions: list[SessionOut] = []
    upcoming_bookings: list[BookingOut] = []


# ==========================================
# MEDIA SCHEMAS
# ==========================================

class ActivityMediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    media_type: str
    mime_type: str
    file_size: int
    file_name: str | None = None
    caption: str | None = None
    sort_order: int


# ==========================================
# CUSTOMER SCHEMA (reuse master customers)
# ==========================================

class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    phone: str
    email: str | None = None
    address: str | None = None


class CustomerCreate(BaseModel):
    full_name: str
    phone: str
    email: str
    address: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        cleaned = str(v or "").strip().lower()
        if not cleaned:
            raise ValueError("Email address is required.")
        if len(cleaned) > 150 or ".." in cleaned or not _STRICT_EMAIL_REGEX.match(cleaned):
            raise ValueError("Enter a valid email address (e.g. name@example.com).")
        return cleaned


class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1)


class BulkParticipantUpdateRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    waiver_signed: bool | None = None
    attendance_status: str | None = None

    @field_validator("attendance_status")
    @classmethod
    def validate_attendance_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ATTENDANCE_STATUSES:
            raise ValueError(f"attendance_status must be one of {ATTENDANCE_STATUSES}")
        return v


# ==========================================
# INVOICE / PAYMENT SCHEMAS
# ==========================================

class ActivityInvoiceCreate(BaseModel):
    booking_id: int
    gst_rate: Decimal = Decimal("18.00")
    notes: str | None = None


class PaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str
    reference_number: str | None = None
    payment_type: str = "Full"


# ==========================================
# REPORT SCHEMAS
# ==========================================

class ReportParams(BaseModel):
    date_from: datetime.date | None = None
    date_to: datetime.date | None = None
    activity_id: int | None = None
    category: str | None = None
    booking_type: str | None = None
    status: str | None = None
    page: int = 1
    page_size: int = 50


# ==========================================
# AVAILABILITY SCHEMA
# ==========================================

class ResourceAvailabilityCheck(BaseModel):
    resource_id: int
    slot_date: datetime.date
    start_time: str  # HH:MM
    end_time: str
    exclude_booking_id: int | None = None


# ==========================================
# INSTRUCTOR / STAFF SCHEMAS
# ==========================================

class ActivityStaffCreate(BaseModel):
    full_name: str
    email: str
    phone: str
    employee_code: str | None = None
    designation: str = "Activity Instructor"
    activity_ids: list[int] = []
    is_active: bool = True

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        cleaned = str(v or "").strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_staff_email(cls, v: str) -> str:
        cleaned = str(v or "").strip().lower()
        if not cleaned or len(cleaned) > 150 or ".." in cleaned or not _STRICT_EMAIL_REGEX.match(cleaned):
            raise ValueError("Enter a valid email address (e.g. name@example.com).")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = str(v or "").strip()
        if not cleaned:
            raise ValueError("Phone number is required.")
        return cleaned


class ActivityStaffUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    employee_code: str | None = None
    designation: str | None = None
    activity_ids: list[int] | None = None
    is_active: bool | None = None

    @field_validator("email")
    @classmethod
    def validate_staff_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = str(v).strip().lower()
        if not cleaned or len(cleaned) > 150 or ".." in cleaned or not _STRICT_EMAIL_REGEX.match(cleaned):
            raise ValueError("Enter a valid email address (e.g. name@example.com).")
        return cleaned
