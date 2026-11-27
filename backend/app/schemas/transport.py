"""Pydantic schemas for the Transport Management module."""
from __future__ import annotations

import datetime
from decimal import Decimal
import re

from pydantic import BaseModel, Field, field_validator, model_validator

VEHICLE_STATUSES = {"Available", "Assigned", "On Trip", "Maintenance", "Inactive"}
DRIVER_AVAILABILITY_STATUSES = {"Available", "On Trip", "Off Duty", "On Leave", "Unavailable"}
DRIVER_EMPLOYMENT_STATUSES = {"Active", "On Leave", "Inactive"}
ROUTE_TYPES = {
    "Airport Transfer",
    "Railway Station Transfer",
    "Local Sightseeing",
    "Resort Pickup/Drop",
    "Intercity Transfer",
    "Custom Route",
}
PRICING_MODELS = {"Flat", "Per Km", "Per Hour", "Hybrid"}
BOOKING_TYPES = {
    "Guest Transfer",
    "Airport Transfer",
    "Local Travel",
    "Activity Transfer",
    "Package Transfer",
    "Custom Transport",
}
BOOKING_STATUSES = {
    "Pending",
    "Confirmed",
    "Assigned",
    "Driver En Route",
    "In Progress",
    "Completed",
    "Cancelled",
    "No Show",
}
MAINTENANCE_STATUSES = {"Scheduled", "In Progress", "Completed", "Cancelled"}
MAINTENANCE_TYPES = {
    "Routine Service",
    "Repair",
    "Inspection",
    "Tyre Replacement",
    "Insurance/Permit",
    "Breakdown",
    "Other",
}
EXPENSE_CATEGORIES = {"Fuel", "Toll", "Parking", "Washing", "Permit Fee", "Repair", "Other"}
PAYMENT_METHODS = {"Cash", "UPI", "Card", "Net Banking"}
PAYMENT_TYPES = {"Advance", "Partial", "Full", "Refund"}


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _parse_hhmm(value: str) -> str:
    cleaned = value.strip()
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", cleaned):
        raise ValueError("Time must be in HH:MM 24-hour format.")
    return cleaned


# ==========================================
# VEHICLE CATEGORIES
# ==========================================

class VehicleCategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    default_capacity: int = Field(default=4, ge=1, le=100)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return v.strip()


class VehicleCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    default_capacity: int | None = Field(default=None, ge=1, le=100)
    is_active: bool | None = None


# ==========================================
# VEHICLES
# ==========================================

class VehicleCreate(BaseModel):
    vehicle_name: str = Field(..., min_length=2, max_length=120)
    registration_number: str = Field(..., min_length=3, max_length=40)
    category_id: int = Field(..., ge=1)
    vehicle_type: str | None = Field(default=None, max_length=80)
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=80)
    year: int | None = Field(default=None, ge=1980, le=2050)
    seating_capacity: int = Field(..., ge=1, le=100)
    fuel_type: str | None = Field(default=None, max_length=40)
    transmission_type: str | None = Field(default=None, max_length=40)
    status: str = Field(default="Available", max_length=30)
    is_active: bool = True
    insurance_provider: str | None = Field(default=None, max_length=120)
    insurance_policy_number: str | None = Field(default=None, max_length=80)
    insurance_expiry: datetime.date | None = None
    registration_validity: datetime.date | None = None
    permit_validity: datetime.date | None = None
    last_service_date: datetime.date | None = None
    next_service_date: datetime.date | None = None
    odometer_km: int = Field(default=0, ge=0, le=5_000_000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("registration_number")
    @classmethod
    def clean_reg(cls, v: str) -> str:
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        cleaned = v.strip()
        if cleaned not in VEHICLE_STATUSES:
            raise ValueError(f"Vehicle status must be one of: {', '.join(sorted(VEHICLE_STATUSES))}")
        return cleaned


class VehicleUpdate(BaseModel):
    vehicle_name: str | None = Field(default=None, min_length=2, max_length=120)
    registration_number: str | None = Field(default=None, min_length=3, max_length=40)
    category_id: int | None = Field(default=None, ge=1)
    vehicle_type: str | None = Field(default=None, min_length=2, max_length=80)
    make: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1980, le=2050)
    seating_capacity: int | None = Field(default=None, ge=1, le=100)
    fuel_type: str | None = Field(default=None, min_length=2, max_length=40)
    transmission_type: str | None = Field(default=None, max_length=40)
    status: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    insurance_provider: str | None = Field(default=None, max_length=120)
    insurance_policy_number: str | None = Field(default=None, max_length=80)
    insurance_expiry: datetime.date | None = None
    registration_validity: datetime.date | None = None
    permit_validity: datetime.date | None = None
    last_service_date: datetime.date | None = None
    next_service_date: datetime.date | None = None
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("registration_number")
    @classmethod
    def clean_reg(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if cleaned not in VEHICLE_STATUSES:
            raise ValueError(f"Vehicle status must be one of: {', '.join(sorted(VEHICLE_STATUSES))}")
        return cleaned


class VehicleStatusUpdate(BaseModel):
    is_active: bool | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if cleaned not in VEHICLE_STATUSES:
            raise ValueError(f"Vehicle status must be one of: {', '.join(sorted(VEHICLE_STATUSES))}")
        return cleaned


# ==========================================
# DRIVERS
# ==========================================

class DriverCreate(BaseModel):
    driver_name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    licence_number: str = Field(..., min_length=4, max_length=60)
    licence_validity: datetime.date
    experience_years: int = Field(default=0, ge=0, le=70)
    address: str | None = Field(default=None, max_length=1000)
    assigned_vehicle_id: int | None = Field(default=None, ge=1)
    staff_id: int | None = Field(default=None, ge=1)
    availability_status: str = Field(default="Available", max_length=30)
    employment_status: str = Field(default="Active", max_length=30)
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("licence_number")
    @classmethod
    def clean_licence(cls, v: str) -> str:
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("availability_status")
    @classmethod
    def check_avail(cls, v: str) -> str:
        if v.strip() not in DRIVER_AVAILABILITY_STATUSES:
            raise ValueError(f"Availability must be one of: {', '.join(sorted(DRIVER_AVAILABILITY_STATUSES))}")
        return v.strip()

    @field_validator("employment_status")
    @classmethod
    def check_emp(cls, v: str) -> str:
        if v.strip() not in DRIVER_EMPLOYMENT_STATUSES:
            raise ValueError(f"Employment status must be one of: {', '.join(sorted(DRIVER_EMPLOYMENT_STATUSES))}")
        return v.strip()


class DriverUpdate(BaseModel):
    driver_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=10, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    licence_number: str | None = Field(default=None, min_length=4, max_length=60)
    licence_validity: datetime.date | None = None
    experience_years: int | None = Field(default=None, ge=0, le=70)
    address: str | None = Field(default=None, max_length=1000)
    assigned_vehicle_id: int | None = None
    staff_id: int | None = None
    availability_status: str | None = Field(default=None, max_length=30)
    employment_status: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("licence_number")
    @classmethod
    def clean_licence(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("availability_status")
    @classmethod
    def check_avail(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in DRIVER_AVAILABILITY_STATUSES:
            raise ValueError(f"Availability must be one of: {', '.join(sorted(DRIVER_AVAILABILITY_STATUSES))}")
        return v.strip()

    @field_validator("employment_status")
    @classmethod
    def check_emp(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in DRIVER_EMPLOYMENT_STATUSES:
            raise ValueError(f"Employment status must be one of: {', '.join(sorted(DRIVER_EMPLOYMENT_STATUSES))}")
        return v.strip()


# ==========================================
# ROUTES
# ==========================================

class RouteCreate(BaseModel):
    route_name: str = Field(..., min_length=2, max_length=150)
    route_code: str | None = Field(default=None, max_length=50)
    starting_location: str = Field(..., min_length=2, max_length=150)
    destination: str = Field(..., min_length=2, max_length=150)
    intermediate_stops: str | None = Field(default=None, max_length=2000)
    approximate_distance_km: Decimal = Field(..., ge=0, max_digits=10, decimal_places=2)
    estimated_duration_minutes: int = Field(..., ge=1, le=2880)
    route_type: str = Field(..., max_length=60)
    standard_price: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True

    @field_validator("route_code")
    @classmethod
    def clean_code(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = re.sub(r"\s+", "-", v.strip().upper())
        return cleaned if cleaned else None

    @field_validator("route_type")
    @classmethod
    def check_route_type(cls, v: str) -> str:
        if v.strip() not in ROUTE_TYPES:
            raise ValueError(f"Route type must be one of: {', '.join(sorted(ROUTE_TYPES))}")
        return v.strip()


class RouteUpdate(BaseModel):
    route_name: str | None = Field(default=None, min_length=2, max_length=150)
    route_code: str | None = Field(default=None, min_length=2, max_length=50)
    starting_location: str | None = Field(default=None, min_length=2, max_length=150)
    destination: str | None = Field(default=None, min_length=2, max_length=150)
    intermediate_stops: str | None = Field(default=None, max_length=2000)
    approximate_distance_km: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    estimated_duration_minutes: int | None = Field(default=None, ge=1, le=2880)
    route_type: str | None = Field(default=None, max_length=60)
    standard_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None

    @field_validator("route_code")
    @classmethod
    def clean_code(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("route_type")
    @classmethod
    def check_route_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in ROUTE_TYPES:
            raise ValueError(f"Route type must be one of: {', '.join(sorted(ROUTE_TYPES))}")
        return v.strip()


# ==========================================
# TRANSPORT SERVICE CATALOGUE
# ==========================================

class ServiceTypeCreate(BaseModel):
    service_name: str = Field(..., min_length=2, max_length=150)
    service_code: str = Field(..., min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=2000)
    pricing_model: str = Field(default="Flat", max_length=30)
    base_price: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    price_per_km: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    price_per_hour: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    applicable_category_ids: list[int] = Field(default_factory=list)
    is_available: bool = True
    is_active: bool = True

    @field_validator("service_code")
    @classmethod
    def clean_code(cls, v: str) -> str:
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("pricing_model")
    @classmethod
    def check_pricing(cls, v: str) -> str:
        if v.strip() not in PRICING_MODELS:
            raise ValueError(f"Pricing model must be one of: {', '.join(sorted(PRICING_MODELS))}")
        return v.strip()


class ServiceTypeUpdate(BaseModel):
    service_name: str | None = Field(default=None, min_length=2, max_length=150)
    service_code: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=2000)
    pricing_model: str | None = Field(default=None, max_length=30)
    base_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    price_per_km: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    price_per_hour: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    applicable_category_ids: list[int] | None = None
    is_available: bool | None = None
    is_active: bool | None = None

    @field_validator("service_code")
    @classmethod
    def clean_code(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return re.sub(r"\s+", "-", v.strip().upper())

    @field_validator("pricing_model")
    @classmethod
    def check_pricing(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in PRICING_MODELS:
            raise ValueError(f"Pricing model must be one of: {', '.join(sorted(PRICING_MODELS))}")
        return v.strip()


# ==========================================
# BOOKINGS & ASSIGNMENTS
# ==========================================

class PassengerInput(BaseModel):
    passenger_name: str = Field(..., min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    age: int | None = Field(default=None, ge=0, le=120)
    is_primary: bool = False
    notes: str | None = Field(default=None, max_length=500)


class TransportBookingCreate(BaseModel):
    booking_type: str = Field(..., max_length=50)
    customer_id: int | None = Field(default=None, ge=1)
    stay_booking_id: int | None = Field(default=None, ge=1)
    package_booking_id: int | None = Field(default=None, ge=1)
    activity_booking_id: int | None = Field(default=None, ge=1)
    service_type_id: int | None = Field(default=None, ge=1)
    route_id: int | None = Field(default=None, ge=1)
    pickup_location: str = Field(..., min_length=2, max_length=200)
    drop_location: str = Field(..., min_length=2, max_length=200)
    pickup_date: datetime.date
    pickup_time: str
    estimated_distance_km: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2)
    estimated_duration_minutes: int = Field(default=60, ge=1, le=2880)
    passenger_count: int = Field(default=1, ge=1, le=100)
    vehicle_id: int | None = Field(default=None, ge=1)
    driver_id: int | None = Field(default=None, ge=1)
    base_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    additional_charges: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    passengers: list[PassengerInput] = Field(default_factory=list)

    @field_validator("booking_type")
    @classmethod
    def check_booking_type(cls, v: str) -> str:
        if v.strip() not in BOOKING_TYPES:
            raise ValueError(f"Booking type must be one of: {', '.join(sorted(BOOKING_TYPES))}")
        return v.strip()

    @field_validator("pickup_time")
    @classmethod
    def check_pickup_time(cls, v: str) -> str:
        return _parse_hhmm(v)


class TransportBookingUpdate(BaseModel):
    booking_type: str | None = Field(default=None, max_length=50)
    customer_id: int | None = Field(default=None, ge=1)
    stay_booking_id: int | None = None
    package_booking_id: int | None = None
    activity_booking_id: int | None = None
    service_type_id: int | None = None
    route_id: int | None = None
    pickup_location: str | None = Field(default=None, min_length=2, max_length=200)
    drop_location: str | None = Field(default=None, min_length=2, max_length=200)
    pickup_date: datetime.date | None = None
    pickup_time: str | None = None
    estimated_distance_km: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    estimated_duration_minutes: int | None = Field(default=None, ge=1, le=2880)
    passenger_count: int | None = Field(default=None, ge=1, le=100)
    vehicle_id: int | None = None
    driver_id: int | None = None
    base_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    additional_charges: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("booking_type")
    @classmethod
    def check_booking_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in BOOKING_TYPES:
            raise ValueError(f"Booking type must be one of: {', '.join(sorted(BOOKING_TYPES))}")
        return v.strip()

    @field_validator("pickup_time")
    @classmethod
    def check_pickup_time(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _parse_hhmm(v)


class AssignmentRequest(BaseModel):
    vehicle_id: int = Field(..., ge=1)
    driver_id: int = Field(..., ge=1)
    remarks: str | None = Field(default=None, max_length=1000)


class TripStatusUpdate(BaseModel):
    status: str = Field(..., max_length=30)
    reason: str | None = Field(default=None, max_length=1000)
    actual_departure_at: datetime.datetime | None = None
    actual_arrival_at: datetime.datetime | None = None
    start_odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    end_odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    remarks: str | None = Field(default=None, max_length=2000)

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        cleaned = v.strip()
        if cleaned not in BOOKING_STATUSES:
            raise ValueError(f"Booking status must be one of: {', '.join(sorted(BOOKING_STATUSES))}")
        return cleaned

    @model_validator(mode="after")
    def validate_rules(self):
        if self.status == "Cancelled" and (not self.reason or len(self.reason.strip()) < 3):
            raise ValueError("A cancellation reason (minimum 3 characters) is required.")
        if (
            self.start_odometer_km is not None
            and self.end_odometer_km is not None
            and self.end_odometer_km < self.start_odometer_km
        ):
            raise ValueError("End odometer reading cannot be lower than start odometer reading.")
        return self


# ==========================================
# MAINTENANCE
# ==========================================

class MaintenanceCreate(BaseModel):
    vehicle_id: int = Field(..., ge=1)
    maintenance_type: str = Field(..., max_length=80)
    service_date: datetime.date
    service_description: str = Field(..., min_length=3, max_length=2000)
    service_provider: str | None = Field(default=None, max_length=150)
    cost: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    next_service_date: datetime.date | None = None
    status: str = Field(default="Scheduled", max_length=30)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("maintenance_type")
    @classmethod
    def check_type(cls, v: str) -> str:
        if v.strip() not in MAINTENANCE_TYPES:
            raise ValueError(f"Maintenance type must be one of: {', '.join(sorted(MAINTENANCE_TYPES))}")
        return v.strip()

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        if v.strip() not in MAINTENANCE_STATUSES:
            raise ValueError(f"Maintenance status must be one of: {', '.join(sorted(MAINTENANCE_STATUSES))}")
        return v.strip()


class MaintenanceUpdate(BaseModel):
    maintenance_type: str | None = Field(default=None, max_length=80)
    service_date: datetime.date | None = None
    service_description: str | None = Field(default=None, min_length=3, max_length=2000)
    service_provider: str | None = Field(default=None, max_length=150)
    cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    next_service_date: datetime.date | None = None
    status: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() not in MAINTENANCE_STATUSES:
            raise ValueError(f"Maintenance status must be one of: {', '.join(sorted(MAINTENANCE_STATUSES))}")
        return v.strip()


# ==========================================
# FUEL & OPERATING EXPENSES
# ==========================================

class FuelExpenseCreate(BaseModel):
    vehicle_id: int = Field(..., ge=1)
    record_date: datetime.date
    expense_category: str = Field(default="Fuel", max_length=50)
    fuel_type: str | None = Field(default=None, max_length=40)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    cost_per_unit: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    total_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    vendor_name: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("expense_category")
    @classmethod
    def check_cat(cls, v: str) -> str:
        if v.strip() not in EXPENSE_CATEGORIES:
            raise ValueError(f"Expense category must be one of: {', '.join(sorted(EXPENSE_CATEGORIES))}")
        return v.strip()


class FuelExpenseUpdate(BaseModel):
    record_date: datetime.date | None = None
    expense_category: str | None = Field(default=None, max_length=50)
    fuel_type: str | None = Field(default=None, max_length=40)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    cost_per_unit: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    total_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)
    vendor_name: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=2000)


# ==========================================
# INVOICES & PAYMENTS
# ==========================================

class TransportInvoiceCreate(BaseModel):
    booking_id: int = Field(..., ge=1)
    gst_rate: Decimal = Field(default=Decimal("5.00"), ge=0, le=100, max_digits=5, decimal_places=2)
    additional_charges: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)


class TransportPaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    payment_method: str = Field(..., max_length=30)
    payment_type: str = Field(default="Full", max_length=30)
    reference_number: str | None = Field(default=None, max_length=100)

    @field_validator("payment_method")
    @classmethod
    def check_method(cls, v: str) -> str:
        if v.strip() not in PAYMENT_METHODS:
            raise ValueError(f"Payment method must be one of: {', '.join(sorted(PAYMENT_METHODS))}")
        return v.strip()

    @field_validator("payment_type")
    @classmethod
    def check_type(cls, v: str) -> str:
        if v.strip() not in PAYMENT_TYPES:
            raise ValueError(f"Payment type must be one of: {', '.join(sorted(PAYMENT_TYPES))}")
        return v.strip()

    @field_validator("reference_number")
    @classmethod
    def clean_ref(cls, v: str | None) -> str | None:
        return _clean_text(v)
