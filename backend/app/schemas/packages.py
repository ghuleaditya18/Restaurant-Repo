from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.packages import (
    PackageBookingStatus,
    PackageCategory,
    PackageInclusionType,
    PackagePricingType,
    PackageStatus,
)

VALID_CATEGORIES = {c.value for c in PackageCategory}
VALID_STATUSES = {s.value for s in PackageStatus}
VALID_PRICING_TYPES = {p.value for p in PackagePricingType}
VALID_INCLUSION_TYPES = {i.value for i in PackageInclusionType}
VALID_BOOKING_STATUSES = {b.value for b in PackageBookingStatus}
VALID_PAYMENT_METHODS = {"Cash", "UPI", "Card", "Net Banking"}
VALID_PAYMENT_TYPES = {"Advance", "Partial", "Full"}


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


class PackageItemInput(BaseModel):
    inclusion_type: str = Field(..., min_length=2, max_length=40)
    description: str = Field(..., min_length=2, max_length=1000)
    quantity: int = Field(default=1, ge=1, le=500)
    is_optional: bool = False
    reference_module: str | None = Field(default=None, max_length=40)
    reference_id: int | None = Field(default=None, ge=1)
    reference_label: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=1000)
    sort_order: int = Field(default=0, ge=0, le=1000)

    @field_validator("inclusion_type")
    @classmethod
    def check_inclusion_type(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_INCLUSION_TYPES:
            raise ValueError(f"Inclusion type must be one of: {', '.join(sorted(VALID_INCLUSION_TYPES))}.")
        return cleaned

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Inclusion description must contain at least 2 characters.")
        return cleaned

    @field_validator("reference_module", "reference_label", "notes")
    @classmethod
    def clean_opt(cls, value: str | None) -> str | None:
        return _clean_text(value)


class PackageItemUpdate(BaseModel):
    inclusion_type: str | None = Field(default=None, min_length=2, max_length=40)
    description: str | None = Field(default=None, min_length=2, max_length=1000)
    quantity: int | None = Field(default=None, ge=1, le=500)
    is_optional: bool | None = None
    reference_module: str | None = Field(default=None, max_length=40)
    reference_id: int | None = Field(default=None, ge=1)
    reference_label: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=1000)
    sort_order: int | None = Field(default=None, ge=0, le=1000)

    @field_validator("inclusion_type")
    @classmethod
    def check_inclusion_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if cleaned not in VALID_INCLUSION_TYPES:
            raise ValueError(f"Inclusion type must be one of: {', '.join(sorted(VALID_INCLUSION_TYPES))}.")
        return cleaned

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Inclusion description must contain at least 2 characters.")
        return cleaned


class PackageCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    package_code: str | None = Field(default=None, max_length=50)
    category: str = Field(..., min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=4000)
    duration_nights: int = Field(..., ge=1, le=365)
    min_guests: int = Field(default=1, ge=1, le=200)
    max_guests: int = Field(default=2, ge=1, le=500)
    pricing_type: str = Field(default=PackagePricingType.PER_PACKAGE.value, max_length=30)
    price: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    valid_from: date
    valid_to: date
    applicable_accommodation_types: str | None = Field(default=None, max_length=1000)
    is_customizable: bool = False
    is_seasonal_offer: bool = False
    offer_badge: str | None = Field(default=None, max_length=60)
    terms_and_conditions: str | None = Field(default=None, max_length=5000)
    exclusions: str | None = Field(default=None, max_length=3000)
    items: list[PackageItemInput] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Package name must contain at least 2 characters.")
        return cleaned

    @field_validator("package_code")
    @classmethod
    def clean_code(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("category")
    @classmethod
    def check_category(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(sorted(VALID_CATEGORIES))}.")
        return cleaned

    @field_validator("pricing_type")
    @classmethod
    def check_pricing_type(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_PRICING_TYPES:
            raise ValueError(f"Pricing type must be one of: {', '.join(sorted(VALID_PRICING_TYPES))}.")
        return cleaned

    @field_validator(
        "description",
        "applicable_accommodation_types",
        "offer_badge",
        "terms_and_conditions",
        "exclusions",
    )
    @classmethod
    def clean_optional_fields(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.max_guests < self.min_guests:
            raise ValueError("Maximum guests cannot be lower than minimum guests.")
        if self.valid_to < self.valid_from:
            raise ValueError("Valid-to date cannot precede valid-from date.")
        return self


class PackageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    category: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=4000)
    duration_nights: int | None = Field(default=None, ge=1, le=365)
    min_guests: int | None = Field(default=None, ge=1, le=200)
    max_guests: int | None = Field(default=None, ge=1, le=500)
    pricing_type: str | None = Field(default=None, max_length=30)
    price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    valid_from: date | None = None
    valid_to: date | None = None
    applicable_accommodation_types: str | None = Field(default=None, max_length=1000)
    is_customizable: bool | None = None
    is_seasonal_offer: bool | None = None
    offer_badge: str | None = Field(default=None, max_length=60)
    terms_and_conditions: str | None = Field(default=None, max_length=5000)
    exclusions: str | None = Field(default=None, max_length=3000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Package name must contain at least 2 characters.")
        return cleaned

    @field_validator("category")
    @classmethod
    def check_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if cleaned not in VALID_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(sorted(VALID_CATEGORIES))}.")
        return cleaned

    @field_validator("pricing_type")
    @classmethod
    def check_pricing_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if cleaned not in VALID_PRICING_TYPES:
            raise ValueError(f"Pricing type must be one of: {', '.join(sorted(VALID_PRICING_TYPES))}.")
        return cleaned

    @field_validator(
        "description",
        "applicable_accommodation_types",
        "offer_badge",
        "terms_and_conditions",
        "exclusions",
    )
    @classmethod
    def clean_optional_fields(cls, value: str | None) -> str | None:
        return _clean_text(value)


class PackageStatusUpdate(BaseModel):
    status: str = Field(..., max_length=30)

    @field_validator("status")
    @classmethod
    def check_status(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}.")
        return cleaned


class PackageBlackoutInput(BaseModel):
    package_id: int = Field(..., ge=1)
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=2, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Blackout reason must contain at least 2 characters.")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Blackout end date cannot precede start date.")
        return self


class PackageBlackoutUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    reason: str | None = Field(default=None, min_length=2, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class PackageMediaUpdate(BaseModel):
    media_type: str | None = Field(default=None, pattern="^(cover|gallery)$")
    caption: str | None = Field(default=None, max_length=255)
    sort_order: int | None = Field(default=None, ge=0, le=1000)


class PackageBookingCreate(BaseModel):
    package_id: int = Field(..., ge=1)
    customer_id: int = Field(..., ge=1)
    start_date: date
    guest_count: int = Field(..., ge=1, le=500)
    selected_optional_item_ids: list[int] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    generate_invoice: bool = False
    gst_rate: Decimal = Field(default=Decimal("18.00"), ge=0, le=100, max_digits=5, decimal_places=2)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return _clean_text(value)


class PackageBookingStatusUpdate(BaseModel):
    status: str = Field(..., max_length=30)
    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def check_booking_status(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_BOOKING_STATUSES:
            raise ValueError(f"Booking status must be one of: {', '.join(sorted(VALID_BOOKING_STATUSES))}.")
        return cleaned

    @model_validator(mode="after")
    def require_cancellation_reason(self):
        if self.status == PackageBookingStatus.CANCELLED.value:
            if not self.reason or len(self.reason.strip()) < 3:
                raise ValueError("A cancellation reason (minimum 3 characters) is required.")
        return self


class PackageInvoiceCreate(BaseModel):
    booking_id: int = Field(..., ge=1)
    gst_rate: Decimal = Field(default=Decimal("18.00"), ge=0, le=100, max_digits=5, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)


class PackagePaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    payment_method: str = Field(..., max_length=30)
    payment_type: str = Field(default="Full", max_length=30)
    reference_number: str | None = Field(default=None, max_length=100)

    @field_validator("payment_method")
    @classmethod
    def check_method(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_PAYMENT_METHODS:
            raise ValueError(f"Payment method must be one of: {', '.join(sorted(VALID_PAYMENT_METHODS))}.")
        return cleaned

    @field_validator("payment_type")
    @classmethod
    def check_type(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned not in VALID_PAYMENT_TYPES:
            raise ValueError(f"Payment type must be one of: {', '.join(sorted(VALID_PAYMENT_TYPES))}.")
        return cleaned

    @field_validator("reference_number")
    @classmethod
    def clean_ref(cls, value: str | None) -> str | None:
        return _clean_text(value)
