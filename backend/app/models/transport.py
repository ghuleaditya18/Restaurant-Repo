"""Transport Management module SQLAlchemy models."""
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
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.entities import TimestampMixin


class VehicleStatus(str, Enum):
    AVAILABLE = "Available"
    ASSIGNED = "Assigned"
    ON_TRIP = "On Trip"
    MAINTENANCE = "Maintenance"
    INACTIVE = "Inactive"


class DriverAvailabilityStatus(str, Enum):
    AVAILABLE = "Available"
    ON_TRIP = "On Trip"
    OFF_DUTY = "Off Duty"
    ON_LEAVE = "On Leave"
    UNAVAILABLE = "Unavailable"


class DriverEmploymentStatus(str, Enum):
    ACTIVE = "Active"
    ON_LEAVE = "On Leave"
    INACTIVE = "Inactive"


class RouteType(str, Enum):
    AIRPORT_TRANSFER = "Airport Transfer"
    RAILWAY_STATION_TRANSFER = "Railway Station Transfer"
    LOCAL_SIGHTSEEING = "Local Sightseeing"
    RESORT_PICKUP_DROP = "Resort Pickup/Drop"
    INTERCITY_TRANSFER = "Intercity Transfer"
    CUSTOM_ROUTE = "Custom Route"


class ServicePricingModel(str, Enum):
    FLAT = "Flat"
    PER_KM = "Per Km"
    PER_HOUR = "Per Hour"
    HYBRID = "Hybrid"


class TransportBookingType(str, Enum):
    GUEST_TRANSFER = "Guest Transfer"
    AIRPORT_TRANSFER = "Airport Transfer"
    LOCAL_TRAVEL = "Local Travel"
    ACTIVITY_TRANSFER = "Activity Transfer"
    PACKAGE_TRANSFER = "Package Transfer"
    CUSTOM_TRANSPORT = "Custom Transport"


class TransportBookingStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    ASSIGNED = "Assigned"
    DRIVER_EN_ROUTE = "Driver En Route"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    NO_SHOW = "No Show"


class MaintenanceStatus(str, Enum):
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


def generate_transport_booking_number() -> str:
    year = datetime.now().year
    return f"TRN-{year}-{uuid4().hex[:6].upper()}"


# ==========================================
# 1. VEHICLE CATEGORIES
# ==========================================

class TransportVehicleCategory(TimestampMixin, Base):
    __tablename__ = "transport_vehicle_categories"
    __table_args__ = (
        CheckConstraint("default_capacity >= 1", name="ck_trn_cat_capacity_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_capacity: Mapped[int] = mapped_column(Integer, default=4, server_default="4", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    vehicles: Mapped[list[TransportVehicle]] = relationship(back_populates="category")


# ==========================================
# 2. VEHICLES
# ==========================================

class TransportVehicle(TimestampMixin, Base):
    __tablename__ = "transport_vehicles"
    __table_args__ = (
        CheckConstraint("seating_capacity >= 1", name="ck_trn_vehicle_capacity_positive"),
        CheckConstraint("odometer_km >= 0", name="ck_trn_vehicle_odometer_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT", server_default="TRANSPORT", index=True, nullable=False
    )
    vehicle_name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    registration_number: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("transport_vehicle_categories.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    vehicle_type: Mapped[str] = mapped_column(String(80), nullable=False)
    make: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seating_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(40), nullable=False)
    transmission_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(
        String(30), default=VehicleStatus.AVAILABLE.value, server_default="Available", index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True, nullable=False)

    insurance_provider: Mapped[str | None] = mapped_column(String(120), nullable=True)
    insurance_policy_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    insurance_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    registration_validity: Mapped[date | None] = mapped_column(Date, nullable=True)
    permit_validity: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    odometer_km: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    category: Mapped[TransportVehicleCategory] = relationship(back_populates="vehicles")
    assigned_drivers: Mapped[list[TransportDriver]] = relationship(back_populates="assigned_vehicle")
    maintenance_records: Mapped[list[TransportMaintenanceRecord]] = relationship(back_populates="vehicle")
    fuel_records: Mapped[list[TransportFuelRecord]] = relationship(back_populates="vehicle")


# ==========================================
# 3. DRIVERS
# ==========================================

class TransportDriver(TimestampMixin, Base):
    __tablename__ = "transport_drivers"
    __table_args__ = (
        CheckConstraint("experience_years >= 0", name="ck_trn_driver_exp_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT", server_default="TRANSPORT", index=True, nullable=False
    )
    staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    driver_name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    profile_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    licence_number: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    licence_validity: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    experience_years: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="SET NULL"), index=True, nullable=True
    )
    availability_status: Mapped[str] = mapped_column(
        String(30), default=DriverAvailabilityStatus.AVAILABLE.value, server_default="Available", index=True, nullable=False
    )
    employment_status: Mapped[str] = mapped_column(
        String(30), default=DriverEmploymentStatus.ACTIVE.value, server_default="Active", index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    assigned_vehicle: Mapped[TransportVehicle | None] = relationship(back_populates="assigned_drivers")
    staff = relationship("Staff")


# ==========================================
# 4. ROUTES
# ==========================================

class TransportRoute(TimestampMixin, Base):
    __tablename__ = "transport_routes"
    __table_args__ = (
        CheckConstraint("approximate_distance_km >= 0", name="ck_trn_route_dist_nonneg"),
        CheckConstraint("estimated_duration_minutes >= 1", name="ck_trn_route_dur_positive"),
        CheckConstraint("standard_price >= 0", name="ck_trn_route_price_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT", server_default="TRANSPORT", index=True, nullable=False
    )
    route_name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    route_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    starting_location: Mapped[str] = mapped_column(String(150), nullable=False)
    destination: Mapped[str] = mapped_column(String(150), nullable=False)
    intermediate_stops: Mapped[str | None] = mapped_column(Text, nullable=True)
    approximate_distance_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=30, server_default="30", nullable=False)
    route_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    standard_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True, nullable=False)


# ==========================================
# 5. TRANSPORT SERVICE CATALOGUE
# ==========================================

class TransportServiceType(TimestampMixin, Base):
    __tablename__ = "transport_service_types"
    __table_args__ = (
        CheckConstraint("base_price >= 0", name="ck_trn_svc_base_price_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT", server_default="TRANSPORT", index=True, nullable=False
    )
    service_name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    service_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    pricing_model: Mapped[str] = mapped_column(String(30), default=ServicePricingModel.FLAT.value, server_default="Flat", nullable=False)
    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    price_per_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    price_per_hour: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    applicable_category_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True, nullable=False)


# ==========================================
# 6. TRANSPORT BOOKINGS
# ==========================================

class TransportBooking(TimestampMixin, Base):
    __tablename__ = "transport_bookings"
    __table_args__ = (
        CheckConstraint("passenger_count >= 1", name="ck_trn_booking_passengers_positive"),
        CheckConstraint("base_price >= 0", name="ck_trn_booking_base_nonneg"),
        CheckConstraint("additional_charges >= 0", name="ck_trn_booking_add_nonneg"),
        CheckConstraint("discount_amount >= 0", name="ck_trn_booking_disc_nonneg"),
        CheckConstraint("total_amount >= 0", name="ck_trn_booking_total_nonneg"),
        Index("ix_trn_bookings_pickup_date_status", "pickup_date", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT", server_default="TRANSPORT", index=True, nullable=False
    )
    booking_number: Mapped[str] = mapped_column(
        String(30), unique=True, default=generate_transport_booking_number, index=True, nullable=False
    )
    booking_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    stay_booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("villa_stay_bookings.id", ondelete="SET NULL"), index=True, nullable=True
    )
    package_booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("package_bookings.id", ondelete="SET NULL"), index=True, nullable=True
    )
    activity_booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("activity_bookings.id", ondelete="SET NULL"), index=True, nullable=True
    )

    service_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_service_types.id", ondelete="SET NULL"), index=True, nullable=True
    )
    route_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_routes.id", ondelete="SET NULL"), index=True, nullable=True
    )

    pickup_location: Mapped[str] = mapped_column(String(200), nullable=False)
    drop_location: Mapped[str] = mapped_column(String(200), nullable=False)
    pickup_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    pickup_time: Mapped[time] = mapped_column(Time, nullable=False)
    estimated_end_time: Mapped[time] = mapped_column(Time, nullable=False)
    estimated_distance_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=60, server_default="60", nullable=False)

    passenger_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="SET NULL"), index=True, nullable=True
    )
    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_drivers.id", ondelete="SET NULL"), index=True, nullable=True
    )

    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    additional_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)

    status: Mapped[str] = mapped_column(
        String(30), default=TransportBookingStatus.PENDING.value, server_default="Pending", index=True, nullable=False
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_identifier: Mapped[str] = mapped_column(
        String(50), default="TRANSPORT_BOOKING", server_default="TRANSPORT_BOOKING", nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    customer = relationship("Customer")
    service_type: Mapped[TransportServiceType | None] = relationship()
    route: Mapped[TransportRoute | None] = relationship()
    vehicle: Mapped[TransportVehicle | None] = relationship()
    driver: Mapped[TransportDriver | None] = relationship()
    stay_booking = relationship("StayBooking")
    package_booking = relationship("PackageBooking")
    activity_booking = relationship("ActivityBooking")
    passengers: Mapped[list[TransportBookingPassenger]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    schedules: Mapped[list[TransportSchedule]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    assignments: Mapped[list[TransportAssignment]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="TransportAssignment.id.desc()"
    )
    history: Mapped[list[TransportBookingHistory]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="TransportBookingHistory.changed_at.desc(), TransportBookingHistory.id.desc()"
    )


# ==========================================
# 7. BOOKING PASSENGERS
# ==========================================

class TransportBookingPassenger(Base):
    __tablename__ = "transport_booking_passengers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("transport_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    passenger_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped[TransportBooking] = relationship(back_populates="passengers")


# ==========================================
# 8. TRANSPORT SCHEDULES
# ==========================================

class TransportSchedule(TimestampMixin, Base):
    __tablename__ = "transport_schedules"
    __table_args__ = (
        Index("ix_trn_schedules_date_status", "scheduled_date", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("transport_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="SET NULL"), index=True, nullable=True
    )
    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_drivers.id", ondelete="SET NULL"), index=True, nullable=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="Scheduled", server_default="Scheduled", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    booking: Mapped[TransportBooking] = relationship(back_populates="schedules")
    vehicle: Mapped[TransportVehicle | None] = relationship()
    driver: Mapped[TransportDriver | None] = relationship()


# ==========================================
# 9. TRANSPORT ASSIGNMENTS (TRIP EXECUTION)
# ==========================================

class TransportAssignment(TimestampMixin, Base):
    __tablename__ = "transport_assignments"
    __table_args__ = (
        Index("ix_trn_assignments_vehicle_date", "vehicle_id", "scheduled_date", "assignment_status"),
        Index("ix_trn_assignments_driver_date", "driver_id", "scheduled_date", "assignment_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("transport_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    driver_id: Mapped[int] = mapped_column(
        ForeignKey("transport_drivers.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    scheduled_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    assignment_status: Mapped[str] = mapped_column(
        String(30), default="Assigned", server_default="Assigned", index=True, nullable=False
    )
    actual_departure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_arrival_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_odometer_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_odometer_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    booking: Mapped[TransportBooking] = relationship(back_populates="assignments")
    vehicle: Mapped[TransportVehicle] = relationship()
    driver: Mapped[TransportDriver] = relationship()


# ==========================================
# 10. BOOKING HISTORY
# ==========================================

class TransportBookingHistory(Base):
    __tablename__ = "transport_booking_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("transport_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), default="STATUS_CHANGE", server_default="STATUS_CHANGE", nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking: Mapped[TransportBooking] = relationship(back_populates="history")
    changed_by_user = relationship("User")


# ==========================================
# 11. MAINTENANCE RECORDS
# ==========================================

class TransportMaintenanceRecord(TimestampMixin, Base):
    __tablename__ = "transport_maintenance_records"
    __table_args__ = (
        CheckConstraint("cost >= 0", name="ck_trn_maint_cost_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    maintenance_type: Mapped[str] = mapped_column(String(80), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    service_description: Mapped[str] = mapped_column(Text, nullable=False)
    service_provider: Mapped[str | None] = mapped_column(String(150), nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    odometer_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default=MaintenanceStatus.SCHEDULED.value, server_default="Scheduled", index=True, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    vehicle: Mapped[TransportVehicle] = relationship(back_populates="maintenance_records")


# ==========================================
# 12. FUEL & EXPENSE RECORDS
# ==========================================

class TransportFuelRecord(TimestampMixin, Base):
    __tablename__ = "transport_fuel_records"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_trn_fuel_amount_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    expense_category: Mapped[str] = mapped_column(String(50), default="Fuel", server_default="Fuel", index=True, nullable=False)
    fuel_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    odometer_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vendor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    vehicle: Mapped[TransportVehicle] = relationship(back_populates="fuel_records")
