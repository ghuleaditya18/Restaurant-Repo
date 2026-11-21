from __future__ import annotations

import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ==========================================
# 1. SPA SERVICE CATEGORY SCHEMAS
# ==========================================

class SpaServiceCategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Category name must contain at least 2 characters.")
        return trimmed


class SpaServiceCategoryCreate(SpaServiceCategoryBase):
    pass


class SpaServiceCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Category name must contain at least 2 characters.")
        return trimmed


class SpaServiceCategoryResponse(SpaServiceCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    service_count: int = 0


# ==========================================
# 2. SPA SERVICE SCHEMAS
# ==========================================

class SpaServiceBase(BaseModel):
    category_id: int
    name: str = Field(..., min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    price: Decimal = Field(..., ge=0)
    duration_minutes: int = Field(..., gt=0)
    is_available: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Service name must contain at least 2 characters.")
        return trimmed

    @field_validator("price")
    @classmethod
    def validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Service price cannot be negative.")
        return round(v, 2)

    @field_validator("duration_minutes")
    @classmethod
    def validate_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Duration must be a positive number of minutes.")
        return v


class SpaServiceCreate(SpaServiceBase):
    pass


class SpaServiceUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    price: Decimal | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, gt=0)
    is_available: bool | None = None


class SpaServiceResponse(SpaServiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_name: str | None = None
    created_at: datetime
    updated_at: datetime


# ==========================================
# 3. SPA CUSTOMER SCHEMAS
# ==========================================

class SpaCustomerBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Customer name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        trimmed = v.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7:
            raise ValueError("Phone number must contain at least 7 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v:
            return None
        trimmed = v.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed


class SpaCustomerCreate(SpaCustomerBase):
    pass


class SpaCustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Customer name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7:
            raise ValueError("Phone number must contain at least 7 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v:
            return None
        trimmed = v.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed


class SpaCustomerResponse(SpaCustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_count: int = 0
    created_at: datetime
    updated_at: datetime


# ==========================================
# 4. SPA STAFF & AVAILABILITY SCHEMAS
# ==========================================

class SpaStaffAvailabilityBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)  # 0=Monday .. 6=Sunday
    start_time: str
    end_time: str
    is_available: bool = True

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def serialize_time_to_str(cls, v: Any) -> str:
        if isinstance(v, time):
            return v.strftime("%H:%M")
        return str(v)


class SpaStaffAvailabilityCreate(SpaStaffAvailabilityBase):
    pass


class SpaStaffAvailabilityResponse(SpaStaffAvailabilityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int


class SpaStaffBase(BaseModel):
    employee_code: str = Field(..., min_length=2, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=150)
    designation: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    specialization: str | None = Field(default=None, max_length=150)
    is_therapist: bool = True
    is_active: bool = True

    @field_validator("employee_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        trimmed = v.strip().upper()
        if len(trimmed) < 2:
            raise ValueError("Employee code must contain at least 2 characters.")
        return trimmed

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Staff name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        trimmed = v.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7:
            raise ValueError("Phone number must contain at least 7 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v:
            return None
        trimmed = v.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed


class SpaStaffCreate(SpaStaffBase):
    availabilities: list[SpaStaffAvailabilityCreate] = []


class SpaStaffUpdate(BaseModel):
    employee_code: str | None = Field(default=None, min_length=2, max_length=50)
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    designation: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    specialization: str | None = Field(default=None, max_length=150)
    is_therapist: bool | None = None
    is_active: bool | None = None
    availabilities: list[SpaStaffAvailabilityCreate] | None = None

    @field_validator("employee_code")
    @classmethod
    def validate_code(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip().upper()
        if len(trimmed) < 2:
            raise ValueError("Employee code must contain at least 2 characters.")
        return trimmed

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Staff name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7:
            raise ValueError("Phone number must contain at least 7 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v:
            return None
        trimmed = v.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed



class SpaStaffResponse(SpaStaffBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    availabilities: list[SpaStaffAvailabilityResponse] = []
    active_booking_count: int = 0


# ==========================================
# 5. SPA BOOKING SCHEMAS
# ==========================================

class SpaBookingServiceItemInput(BaseModel):
    service_id: int
    quantity: int = Field(default=1, gt=0)


class SpaBookingCreate(BaseModel):
    customer_id: int | None = None
    new_customer: SpaCustomerCreate | None = None
    staff_id: int
    booking_date: date
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}(:\d{2})?$")
    service_items: list[SpaBookingServiceItemInput] = Field(..., min_length=1)
    notes: str | None = None


class SpaBookingRescheduleInput(BaseModel):
    booking_date: date
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}(:\d{2})?$")
    staff_id: int | None = None  # optional new therapist


class SpaBookingStatusUpdate(BaseModel):
    status: str
    note: str | None = None


class SpaBookingServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    service_name: str
    unit_price: Decimal
    duration_minutes: int
    quantity: int
    subtotal: Decimal


class SpaBookingStatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    previous_status: str | None
    new_status: str
    changed_by: int | None
    changed_by_name: str | None = None
    note: str | None
    changed_at: datetime


class SpaBookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_number: str
    customer_id: int
    customer_name: str
    customer_phone: str
    staff_id: int
    therapist_name: str
    booking_date: date
    start_time: str
    end_time: str
    status: str
    estimated_total: Decimal
    notes: str | None
    created_at: datetime
    updated_at: datetime
    booking_services: list[SpaBookingServiceResponse] = []
    status_history: list[SpaBookingStatusHistoryResponse] = []
    has_invoice: bool = False
    invoice_id: int | None = None


class SpaTimeSlotItem(BaseModel):
    start_time: str
    end_time: str
    display_text: str
    available: bool = True
    buffer_end_time: str | None = None


class SpaAvailableSlotsResponse(BaseModel):
    booking_date: date
    staff_id: int
    therapist_name: str
    total_duration_minutes: int
    buffer_minutes: int = 15
    slots: list[SpaTimeSlotItem]


# ==========================================
# 6. SPA INVOICE & PAYMENT SCHEMAS
# ==========================================

class SpaInvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_name: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    subtotal: Decimal
    total_amount: Decimal
    duration_minutes: int | None = None


class SpaPaymentCreate(BaseModel):
    payment_method: str = Field(..., pattern=r"^(UPI|Card|Net Banking|Cash)$")
    amount: Decimal = Field(..., gt=0)
    transaction_reference: str | None = None


class SpaPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    payment_reference: str
    payment_method: str
    amount: Decimal
    payment_status: str
    transaction_reference: str | None
    received_by: int | None
    receiver_name: str | None = None
    paid_at: datetime
    invoice_number: str | None = None
    booking_number: str | None = None
    customer_name: str | None = None


class SpaInvoiceCreate(BaseModel):
    booking_id: int
    tax_rate: Decimal | None = Field(default=None, ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)


class SpaInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    booking_id: int
    booking_number: str
    customer_id: int
    customer_name: str
    customer_phone: str
    customer_email: str | None
    subtotal: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    balance_due: Decimal
    payment_status: str
    pdf_path: str | None
    created_at: datetime
    items: list[SpaInvoiceItemResponse] = []
    payments: list[SpaPaymentResponse] = []


# ==========================================
# 7. SPA DASHBOARD SUMMARY SCHEMAS
# ==========================================

class SpaDashboardSummaryResponse(BaseModel):
    total_bookings_today: int = 0
    upcoming_bookings: int = 0
    in_progress_appointments: int = 0
    completed_appointments_today: int = 0
    cancelled_appointments_today: int = 0
    total_customers: int = 0
    active_services: int = 0
    available_therapists: int = 0
    total_therapists: int = 0
    today_revenue: Decimal = Decimal("0.00")
    pending_payments_count: int = 0
    outstanding_balance: Decimal = Decimal("0.00")
    today_schedule: list[SpaBookingResponse] = []
