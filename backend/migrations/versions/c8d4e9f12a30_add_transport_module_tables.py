"""add transport management module tables

Revision ID: c8d4e9f12a30
Revises: a1b2c3d4e5f6
Create Date: 2026-11-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8d4e9f12a30"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==========================================
    # 1. TRANSPORT VEHICLE CATEGORIES
    # ==========================================
    op.create_table(
        "transport_vehicle_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_capacity", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("default_capacity >= 1", name="ck_trn_cat_capacity_positive"),
    )
    op.create_index("ix_transport_vehicle_categories_name", "transport_vehicle_categories", ["name"], unique=True)

    # ==========================================
    # 2. TRANSPORT VEHICLES
    # ==========================================
    op.create_table(
        "transport_vehicles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="TRANSPORT"),
        sa.Column("vehicle_name", sa.String(120), nullable=False),
        sa.Column("registration_number", sa.String(40), nullable=False, unique=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("transport_vehicle_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("vehicle_type", sa.String(80), nullable=False),
        sa.Column("make", sa.String(80), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("seating_capacity", sa.Integer(), nullable=False),
        sa.Column("fuel_type", sa.String(40), nullable=False),
        sa.Column("transmission_type", sa.String(40), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Available"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("insurance_provider", sa.String(120), nullable=True),
        sa.Column("insurance_policy_number", sa.String(80), nullable=True),
        sa.Column("insurance_expiry", sa.Date(), nullable=True),
        sa.Column("registration_validity", sa.Date(), nullable=True),
        sa.Column("permit_validity", sa.Date(), nullable=True),
        sa.Column("last_service_date", sa.Date(), nullable=True),
        sa.Column("next_service_date", sa.Date(), nullable=True),
        sa.Column("odometer_km", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("seating_capacity >= 1", name="ck_trn_vehicle_capacity_positive"),
        sa.CheckConstraint("odometer_km >= 0", name="ck_trn_vehicle_odometer_nonneg"),
    )
    op.create_index("ix_transport_vehicles_business_context", "transport_vehicles", ["business_context"])
    op.create_index("ix_transport_vehicles_vehicle_name", "transport_vehicles", ["vehicle_name"])
    op.create_index("ix_transport_vehicles_registration_number", "transport_vehicles", ["registration_number"], unique=True)
    op.create_index("ix_transport_vehicles_category_id", "transport_vehicles", ["category_id"])
    op.create_index("ix_transport_vehicles_status", "transport_vehicles", ["status"])
    op.create_index("ix_transport_vehicles_is_active", "transport_vehicles", ["is_active"])
    op.create_index("ix_transport_vehicles_is_deleted", "transport_vehicles", ["is_deleted"])

    # ==========================================
    # 3. TRANSPORT DRIVERS
    # ==========================================
    op.create_table(
        "transport_drivers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="TRANSPORT"),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, unique=True),
        sa.Column("driver_name", sa.String(120), nullable=False),
        sa.Column("profile_image_url", sa.String(500), nullable=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(150), nullable=True),
        sa.Column("licence_number", sa.String(60), nullable=False, unique=True),
        sa.Column("licence_validity", sa.Date(), nullable=False),
        sa.Column("experience_years", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("assigned_vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("availability_status", sa.String(30), nullable=False, server_default="Available"),
        sa.Column("employment_status", sa.String(30), nullable=False, server_default="Active"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("experience_years >= 0", name="ck_trn_driver_exp_nonneg"),
    )
    op.create_index("ix_transport_drivers_business_context", "transport_drivers", ["business_context"])
    op.create_index("ix_transport_drivers_driver_name", "transport_drivers", ["driver_name"])
    op.create_index("ix_transport_drivers_phone", "transport_drivers", ["phone"])
    op.create_index("ix_transport_drivers_licence_number", "transport_drivers", ["licence_number"], unique=True)
    op.create_index("ix_transport_drivers_licence_validity", "transport_drivers", ["licence_validity"])
    op.create_index("ix_transport_drivers_assigned_vehicle_id", "transport_drivers", ["assigned_vehicle_id"])
    op.create_index("ix_transport_drivers_availability_status", "transport_drivers", ["availability_status"])
    op.create_index("ix_transport_drivers_employment_status", "transport_drivers", ["employment_status"])
    op.create_index("ix_transport_drivers_is_active", "transport_drivers", ["is_active"])
    op.create_index("ix_transport_drivers_is_deleted", "transport_drivers", ["is_deleted"])

    # ==========================================
    # 4. TRANSPORT ROUTES
    # ==========================================
    op.create_table(
        "transport_routes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="TRANSPORT"),
        sa.Column("route_name", sa.String(150), nullable=False),
        sa.Column("route_code", sa.String(50), nullable=False, unique=True),
        sa.Column("starting_location", sa.String(150), nullable=False),
        sa.Column("destination", sa.String(150), nullable=False),
        sa.Column("intermediate_stops", sa.Text(), nullable=True),
        sa.Column("approximate_distance_km", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("route_type", sa.String(60), nullable=False),
        sa.Column("standard_price", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("approximate_distance_km >= 0", name="ck_trn_route_dist_nonneg"),
        sa.CheckConstraint("estimated_duration_minutes >= 1", name="ck_trn_route_dur_positive"),
        sa.CheckConstraint("standard_price >= 0", name="ck_trn_route_price_nonneg"),
    )
    op.create_index("ix_transport_routes_business_context", "transport_routes", ["business_context"])
    op.create_index("ix_transport_routes_route_name", "transport_routes", ["route_name"])
    op.create_index("ix_transport_routes_route_code", "transport_routes", ["route_code"], unique=True)
    op.create_index("ix_transport_routes_route_type", "transport_routes", ["route_type"])
    op.create_index("ix_transport_routes_is_active", "transport_routes", ["is_active"])
    op.create_index("ix_transport_routes_is_deleted", "transport_routes", ["is_deleted"])

    # ==========================================
    # 5. TRANSPORT SERVICE TYPES
    # ==========================================
    op.create_table(
        "transport_service_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="TRANSPORT"),
        sa.Column("service_name", sa.String(150), nullable=False),
        sa.Column("service_code", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("pricing_model", sa.String(30), nullable=False, server_default="Flat"),
        sa.Column("base_price", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("price_per_km", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_per_hour", sa.Numeric(10, 2), nullable=True),
        sa.Column("applicable_category_ids", sa.Text(), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("base_price >= 0", name="ck_trn_svc_base_price_nonneg"),
    )
    op.create_index("ix_transport_service_types_business_context", "transport_service_types", ["business_context"])
    op.create_index("ix_transport_service_types_service_name", "transport_service_types", ["service_name"])
    op.create_index("ix_transport_service_types_service_code", "transport_service_types", ["service_code"], unique=True)
    op.create_index("ix_transport_service_types_is_active", "transport_service_types", ["is_active"])
    op.create_index("ix_transport_service_types_is_deleted", "transport_service_types", ["is_deleted"])

    # ==========================================
    # 6. TRANSPORT BOOKINGS
    # ==========================================
    op.create_table(
        "transport_bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="TRANSPORT"),
        sa.Column("booking_number", sa.String(30), nullable=False, unique=True),
        sa.Column("booking_type", sa.String(50), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("stay_booking_id", sa.Integer(), sa.ForeignKey("villa_stay_bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("package_booking_id", sa.Integer(), sa.ForeignKey("package_bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("activity_booking_id", sa.Integer(), sa.ForeignKey("activity_bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("service_type_id", sa.Integer(), sa.ForeignKey("transport_service_types.id", ondelete="SET NULL"), nullable=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("transport_routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("pickup_location", sa.String(200), nullable=False),
        sa.Column("drop_location", sa.String(200), nullable=False),
        sa.Column("pickup_date", sa.Date(), nullable=False),
        sa.Column("pickup_time", sa.Time(), nullable=False),
        sa.Column("estimated_end_time", sa.Time(), nullable=False),
        sa.Column("estimated_distance_km", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("passenger_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("transport_drivers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("base_price", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("additional_charges", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_identifier", sa.String(50), nullable=False, server_default="TRANSPORT_BOOKING"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("passenger_count >= 1", name="ck_trn_booking_passengers_positive"),
        sa.CheckConstraint("base_price >= 0", name="ck_trn_booking_base_nonneg"),
        sa.CheckConstraint("additional_charges >= 0", name="ck_trn_booking_add_nonneg"),
        sa.CheckConstraint("discount_amount >= 0", name="ck_trn_booking_disc_nonneg"),
        sa.CheckConstraint("total_amount >= 0", name="ck_trn_booking_total_nonneg"),
    )
    op.create_index("ix_transport_bookings_business_context", "transport_bookings", ["business_context"])
    op.create_index("ix_transport_bookings_booking_number", "transport_bookings", ["booking_number"], unique=True)
    op.create_index("ix_transport_bookings_booking_type", "transport_bookings", ["booking_type"])
    op.create_index("ix_transport_bookings_customer_id", "transport_bookings", ["customer_id"])
    op.create_index("ix_transport_bookings_stay_booking_id", "transport_bookings", ["stay_booking_id"])
    op.create_index("ix_transport_bookings_package_booking_id", "transport_bookings", ["package_booking_id"])
    op.create_index("ix_transport_bookings_activity_booking_id", "transport_bookings", ["activity_booking_id"])
    op.create_index("ix_transport_bookings_service_type_id", "transport_bookings", ["service_type_id"])
    op.create_index("ix_transport_bookings_route_id", "transport_bookings", ["route_id"])
    op.create_index("ix_transport_bookings_pickup_date", "transport_bookings", ["pickup_date"])
    op.create_index("ix_transport_bookings_vehicle_id", "transport_bookings", ["vehicle_id"])
    op.create_index("ix_transport_bookings_driver_id", "transport_bookings", ["driver_id"])
    op.create_index("ix_transport_bookings_status", "transport_bookings", ["status"])
    op.create_index("ix_transport_bookings_is_deleted", "transport_bookings", ["is_deleted"])
    op.create_index("ix_trn_bookings_pickup_date_status", "transport_bookings", ["pickup_date", "status"])

    # ==========================================
    # 7. TRANSPORT BOOKING PASSENGERS
    # ==========================================
    op.create_table(
        "transport_booking_passengers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("transport_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("passenger_name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transport_booking_passengers_booking_id", "transport_booking_passengers", ["booking_id"])

    # ==========================================
    # 8. TRANSPORT SCHEDULES
    # ==========================================
    op.create_table(
        "transport_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("transport_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("transport_drivers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transport_schedules_booking_id", "transport_schedules", ["booking_id"])
    op.create_index("ix_transport_schedules_vehicle_id", "transport_schedules", ["vehicle_id"])
    op.create_index("ix_transport_schedules_driver_id", "transport_schedules", ["driver_id"])
    op.create_index("ix_transport_schedules_scheduled_date", "transport_schedules", ["scheduled_date"])
    op.create_index("ix_transport_schedules_status", "transport_schedules", ["status"])
    op.create_index("ix_trn_schedules_date_status", "transport_schedules", ["scheduled_date", "status"])

    # ==========================================
    # 9. TRANSPORT ASSIGNMENTS
    # ==========================================
    op.create_table(
        "transport_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("transport_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("transport_drivers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("assignment_status", sa.String(30), nullable=False, server_default="Assigned"),
        sa.Column("actual_departure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_odometer_km", sa.Integer(), nullable=True),
        sa.Column("end_odometer_km", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("assigned_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transport_assignments_booking_id", "transport_assignments", ["booking_id"])
    op.create_index("ix_transport_assignments_vehicle_id", "transport_assignments", ["vehicle_id"])
    op.create_index("ix_transport_assignments_driver_id", "transport_assignments", ["driver_id"])
    op.create_index("ix_transport_assignments_scheduled_date", "transport_assignments", ["scheduled_date"])
    op.create_index("ix_transport_assignments_assignment_status", "transport_assignments", ["assignment_status"])
    op.create_index("ix_trn_assignments_vehicle_date", "transport_assignments", ["vehicle_id", "scheduled_date", "assignment_status"])
    op.create_index("ix_trn_assignments_driver_date", "transport_assignments", ["driver_id", "scheduled_date", "assignment_status"])

    # ==========================================
    # 10. TRANSPORT BOOKING HISTORY
    # ==========================================
    op.create_table(
        "transport_booking_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("transport_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False, server_default="STATUS_CHANGE"),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("new_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transport_booking_history_booking_id", "transport_booking_history", ["booking_id"])

    # ==========================================
    # 11. TRANSPORT MAINTENANCE RECORDS
    # ==========================================
    op.create_table(
        "transport_maintenance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("maintenance_type", sa.String(80), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("service_description", sa.Text(), nullable=False),
        sa.Column("service_provider", sa.String(150), nullable=True),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("odometer_km", sa.Integer(), nullable=True),
        sa.Column("next_service_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("cost >= 0", name="ck_trn_maint_cost_nonneg"),
    )
    op.create_index("ix_transport_maintenance_records_vehicle_id", "transport_maintenance_records", ["vehicle_id"])
    op.create_index("ix_transport_maintenance_records_service_date", "transport_maintenance_records", ["service_date"])
    op.create_index("ix_transport_maintenance_records_status", "transport_maintenance_records", ["status"])

    # ==========================================
    # 12. TRANSPORT FUEL & EXPENSE RECORDS
    # ==========================================
    op.create_table(
        "transport_fuel_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("transport_vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("record_date", sa.Date(), nullable=False),
        sa.Column("expense_category", sa.String(50), nullable=False, server_default="Fuel"),
        sa.Column("fuel_type", sa.String(40), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=True),
        sa.Column("cost_per_unit", sa.Numeric(10, 2), nullable=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("odometer_km", sa.Integer(), nullable=True),
        sa.Column("vendor_name", sa.String(150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("total_amount >= 0", name="ck_trn_fuel_amount_nonneg"),
    )
    op.create_index("ix_transport_fuel_records_vehicle_id", "transport_fuel_records", ["vehicle_id"])
    op.create_index("ix_transport_fuel_records_record_date", "transport_fuel_records", ["record_date"])
    op.create_index("ix_transport_fuel_records_expense_category", "transport_fuel_records", ["expense_category"])


def downgrade() -> None:
    op.drop_table("transport_fuel_records")
    op.drop_table("transport_maintenance_records")
    op.drop_table("transport_booking_history")
    op.drop_table("transport_assignments")
    op.drop_table("transport_schedules")
    op.drop_table("transport_booking_passengers")
    op.drop_table("transport_bookings")
    op.drop_table("transport_service_types")
    op.drop_table("transport_routes")
    op.drop_table("transport_drivers")
    op.drop_table("transport_vehicles")
    op.drop_table("transport_vehicle_categories")
