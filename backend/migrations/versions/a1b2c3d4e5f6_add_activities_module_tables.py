"""add activities module tables

Revision ID: a1b2c3d4e5f6
Revises: f3a8d2c19b40
Create Date: 2026-11-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f3a8d2c19b40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==========================================
    # 1. ACTIVITIES
    # ==========================================
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="ACTIVITY"),
        sa.Column("activity_code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_name", sa.String(150), nullable=True),
        sa.Column("booking_type", sa.String(30), nullable=False, server_default="session"),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("safety_notes", sa.Text(), nullable=True),
        sa.Column("required_equipment", sa.Text(), nullable=True),
        sa.Column("min_participants", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_participants", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("min_age", sa.Integer(), nullable=True),
        sa.Column("max_age", sa.Integer(), nullable=True),
        sa.Column("requires_waiver", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("default_staff_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_complimentary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("price_per_person", sa.Numeric(12, 2), nullable=True),
        sa.Column("price_per_group", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Active"),
        sa.Column("cover_image_url", sa.String(500), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("business_context", "activity_code", name="uq_activities_context_code"),
        sa.CheckConstraint("duration_minutes > 0", name="ck_activities_duration_positive"),
        sa.CheckConstraint("min_participants >= 1", name="ck_activities_min_participants"),
        sa.CheckConstraint("max_participants >= min_participants", name="ck_activities_max_gte_min"),
    )
    op.create_index("ix_activities_business_context", "activities", ["business_context"])
    op.create_index("ix_activities_activity_code", "activities", ["activity_code"])
    op.create_index("ix_activities_name", "activities", ["name"])
    op.create_index("ix_activities_category", "activities", ["category"])
    op.create_index("ix_activities_status", "activities", ["status"])
    op.create_index("ix_activities_booking_type", "activities", ["booking_type"])
    op.create_index("ix_activities_is_deleted", "activities", ["is_deleted"])

    # ==========================================
    # 2. ACTIVITY RESOURCES
    # ==========================================
    op.create_table(
        "activity_resources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_activity_resources_activity_id", "activity_resources", ["activity_id"])

    # ==========================================
    # 3. ACTIVITY SCHEDULES
    # ==========================================
    op.create_table(
        "activity_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operating_weekdays", sa.String(30), nullable=False, server_default="0,1,2,3,4,5,6"),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=False),
        sa.Column("default_capacity", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("default_staff_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("valid_to >= valid_from", name="ck_act_schedules_dates_valid"),
        sa.CheckConstraint("default_capacity >= 1", name="ck_act_schedules_capacity_positive"),
    )
    op.create_index("ix_activity_schedules_activity_id", "activity_schedules", ["activity_id"])

    # ==========================================
    # 4. ACTIVITY SESSIONS
    # ==========================================
    op.create_table(
        "activity_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("activity_schedules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("assigned_staff_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cancelled_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("capacity >= 1", name="ck_act_sessions_capacity_positive"),
    )
    op.create_index("ix_activity_sessions_activity_id", "activity_sessions", ["activity_id"])
    op.create_index("ix_activity_sessions_session_date", "activity_sessions", ["session_date"])
    op.create_index("ix_activity_sessions_status", "activity_sessions", ["status"])
    op.create_index("ix_activity_sessions_assigned_staff_id", "activity_sessions", ["assigned_staff_id"])
    op.create_index("ix_activity_sessions_date_activity", "activity_sessions", ["session_date", "activity_id"])

    # ==========================================
    # 5. ACTIVITY BOOKINGS
    # ==========================================
    op.create_table(
        "activity_bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="ACTIVITY"),
        sa.Column("booking_number", sa.String(30), nullable=False, unique=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("activity_sessions.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("activity_resources.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("slot_date", sa.Date(), nullable=True),
        sa.Column("slot_start_time", sa.Time(), nullable=True),
        sa.Column("slot_end_time", sa.Time(), nullable=True),
        sa.Column("participant_count", sa.Integer(), nullable=False),
        sa.Column("booking_type_snapshot", sa.String(30), nullable=False),
        sa.Column("activity_name_snapshot", sa.String(150), nullable=False),
        sa.Column("pricing_method", sa.String(30), nullable=False, server_default="per_person"),
        sa.Column("unit_price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("package_booking_id", sa.Integer(), nullable=True),
        sa.Column("stay_reference", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_identifier", sa.String(50), nullable=False, server_default="ACTIVITY_BOOKING"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("participant_count >= 1", name="ck_act_bookings_participants_positive"),
        sa.CheckConstraint("total_amount >= 0", name="ck_act_bookings_total_non_negative"),
        sa.CheckConstraint("unit_price_snapshot >= 0", name="ck_act_bookings_unit_price_non_negative"),
    )
    op.create_index("ix_activity_bookings_business_context", "activity_bookings", ["business_context"])
    op.create_index("ix_activity_bookings_booking_number", "activity_bookings", ["booking_number"], unique=True)
    op.create_index("ix_activity_bookings_activity_id", "activity_bookings", ["activity_id"])
    op.create_index("ix_activity_bookings_customer_id", "activity_bookings", ["customer_id"])
    op.create_index("ix_activity_bookings_session_id", "activity_bookings", ["session_id"])
    op.create_index("ix_activity_bookings_booking_date", "activity_bookings", ["booking_date"])
    op.create_index("ix_activity_bookings_status", "activity_bookings", ["status"])
    op.create_index("ix_activity_bookings_is_deleted", "activity_bookings", ["is_deleted"])

    # ==========================================
    # 6. ACTIVITY PARTICIPANTS
    # ==========================================
    op.create_table(
        "activity_participants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("activity_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("participant_name", sa.String(100), nullable=False),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("waiver_signed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("attendance_status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_activity_participants_booking_id", "activity_participants", ["booking_id"])

    # ==========================================
    # 7. ACTIVITY MEDIA
    # ==========================================
    op.create_table(
        "activity_media",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False, server_default="gallery"),
        sa.Column("image_data", sa.LargeBinary(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("caption", sa.String(255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_activity_media_activity_id", "activity_media", ["activity_id"])

    # ==========================================
    # 8. ACTIVITY BOOKING HISTORY
    # ==========================================
    op.create_table(
        "activity_booking_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("activity_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False, server_default="STATUS_CHANGE"),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("new_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_activity_booking_history_booking_id", "activity_booking_history", ["booking_id"])

    # ==========================================
    # 9. ACTIVITY USAGE LOGS
    # ==========================================
    op.create_table(
        "activity_usage_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("usage_time", sa.Time(), nullable=True),
        sa.Column("participant_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("amount_charged", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("recorded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("participant_count >= 1", name="ck_act_usage_participants_positive"),
        sa.CheckConstraint("amount_charged >= 0", name="ck_act_usage_amount_non_negative"),
    )
    op.create_index("ix_activity_usage_logs_activity_id", "activity_usage_logs", ["activity_id"])
    op.create_index("ix_activity_usage_logs_usage_date", "activity_usage_logs", ["usage_date"])


def downgrade() -> None:
    op.drop_index("ix_activity_usage_logs_usage_date", table_name="activity_usage_logs")
    op.drop_index("ix_activity_usage_logs_activity_id", table_name="activity_usage_logs")
    op.drop_table("activity_usage_logs")

    op.drop_index("ix_activity_booking_history_booking_id", table_name="activity_booking_history")
    op.drop_table("activity_booking_history")

    op.drop_index("ix_activity_media_activity_id", table_name="activity_media")
    op.drop_table("activity_media")

    op.drop_index("ix_activity_participants_booking_id", table_name="activity_participants")
    op.drop_table("activity_participants")

    op.drop_index("ix_activity_bookings_is_deleted", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_status", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_booking_date", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_session_id", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_customer_id", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_activity_id", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_booking_number", table_name="activity_bookings")
    op.drop_index("ix_activity_bookings_business_context", table_name="activity_bookings")
    op.drop_table("activity_bookings")

    op.drop_index("ix_activity_sessions_date_activity", table_name="activity_sessions")
    op.drop_index("ix_activity_sessions_assigned_staff_id", table_name="activity_sessions")
    op.drop_index("ix_activity_sessions_status", table_name="activity_sessions")
    op.drop_index("ix_activity_sessions_session_date", table_name="activity_sessions")
    op.drop_index("ix_activity_sessions_activity_id", table_name="activity_sessions")
    op.drop_table("activity_sessions")

    op.drop_index("ix_activity_schedules_activity_id", table_name="activity_schedules")
    op.drop_table("activity_schedules")

    op.drop_index("ix_activity_resources_activity_id", table_name="activity_resources")
    op.drop_table("activity_resources")

    op.drop_index("ix_activities_is_deleted", table_name="activities")
    op.drop_index("ix_activities_booking_type", table_name="activities")
    op.drop_index("ix_activities_status", table_name="activities")
    op.drop_index("ix_activities_category", table_name="activities")
    op.drop_index("ix_activities_name", table_name="activities")
    op.drop_index("ix_activities_activity_code", table_name="activities")
    op.drop_index("ix_activities_business_context", table_name="activities")
    op.drop_table("activities")
