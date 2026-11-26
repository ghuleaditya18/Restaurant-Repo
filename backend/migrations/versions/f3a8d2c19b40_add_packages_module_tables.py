"""add packages module tables and extend invoices/payments with source identifiers

Revision ID: f3a8d2c19b40
Revises: e2f8b1c3a409
Create Date: 2026-11-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a8d2c19b40"
down_revision: Union[str, Sequence[str], None] = "e2f8b1c3a409"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "packages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="PACKAGE"),
        sa.Column("package_code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_nights", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("min_guests", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_guests", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("pricing_type", sa.String(30), nullable=False, server_default="Per Package"),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=False),
        sa.Column("applicable_accommodation_types", sa.Text(), nullable=True),
        sa.Column("is_customizable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_seasonal_offer", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("offer_badge", sa.String(60), nullable=True),
        sa.Column("terms_and_conditions", sa.Text(), nullable=True),
        sa.Column("exclusions", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Draft"),
        sa.Column("cover_image_url", sa.String(500), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("business_context", "package_code", name="uq_packages_context_code"),
        sa.CheckConstraint("duration_nights >= 1", name="ck_packages_duration_positive"),
        sa.CheckConstraint("min_guests >= 1", name="ck_packages_min_guests_positive"),
        sa.CheckConstraint("max_guests >= min_guests", name="ck_packages_guest_range_valid"),
        sa.CheckConstraint("price > 0", name="ck_packages_price_positive"),
        sa.CheckConstraint("valid_to >= valid_from", name="ck_packages_validity_range_valid"),
    )
    op.create_index("ix_packages_business_context", "packages", ["business_context"])
    op.create_index("ix_packages_package_code", "packages", ["package_code"])
    op.create_index("ix_packages_name", "packages", ["name"])
    op.create_index("ix_packages_category", "packages", ["category"])
    op.create_index("ix_packages_status", "packages", ["status"])
    op.create_index("ix_packages_valid_from", "packages", ["valid_from"])
    op.create_index("ix_packages_valid_to", "packages", ["valid_to"])
    op.create_index("ix_packages_is_deleted", "packages", ["is_deleted"])

    op.create_table(
        "package_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("package_id", sa.Integer(), sa.ForeignKey("packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inclusion_type", sa.String(40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reference_module", sa.String(40), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("reference_label", sa.String(150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_package_items_qty_positive"),
    )
    op.create_index("ix_package_items_package_id", "package_items", ["package_id"])
    op.create_index("ix_package_items_inclusion_type", "package_items", ["inclusion_type"])

    op.create_table(
        "package_media",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("package_id", sa.Integer(), sa.ForeignKey("packages.id", ondelete="CASCADE"), nullable=False),
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
    op.create_index("ix_package_media_package_id", "package_media", ["package_id"])

    op.create_table(
        "package_blackouts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("package_id", sa.Integer(), sa.ForeignKey("packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("end_date >= start_date", name="ck_package_blackouts_dates_valid"),
    )
    op.create_index("ix_package_blackouts_package_id", "package_blackouts", ["package_id"])
    op.create_index("ix_package_blackouts_start_date", "package_blackouts", ["start_date"])
    op.create_index("ix_package_blackouts_end_date", "package_blackouts", ["end_date"])

    op.create_table(
        "package_bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_context", sa.String(50), nullable=False, server_default="PACKAGE"),
        sa.Column("booking_number", sa.String(30), nullable=False, unique=True),
        sa.Column("package_id", sa.Integer(), sa.ForeignKey("packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("guest_count", sa.Integer(), nullable=False),
        sa.Column("package_name_snapshot", sa.String(150), nullable=False),
        sa.Column("package_code_snapshot", sa.String(50), nullable=False),
        sa.Column("package_category_snapshot", sa.String(50), nullable=False),
        sa.Column("pricing_type_snapshot", sa.String(30), nullable=False),
        sa.Column("unit_price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("duration_nights_snapshot", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("terms_snapshot", sa.Text(), nullable=True),
        sa.Column("exclusions_snapshot", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_identifier", sa.String(50), nullable=False, server_default="PACKAGE_BOOKING"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("guest_count >= 1", name="ck_package_bookings_guests_positive"),
        sa.CheckConstraint("duration_nights_snapshot >= 1", name="ck_package_bookings_duration_positive"),
        sa.CheckConstraint("unit_price_snapshot > 0", name="ck_package_bookings_unit_price_positive"),
        sa.CheckConstraint("total_amount > 0", name="ck_package_bookings_total_positive"),
        sa.CheckConstraint("end_date >= start_date", name="ck_package_bookings_dates_valid"),
    )
    op.create_index("ix_package_bookings_business_context", "package_bookings", ["business_context"])
    op.create_index("ix_package_bookings_booking_number", "package_bookings", ["booking_number"], unique=True)
    op.create_index("ix_package_bookings_package_id", "package_bookings", ["package_id"])
    op.create_index("ix_package_bookings_customer_id", "package_bookings", ["customer_id"])
    op.create_index("ix_package_bookings_booking_date", "package_bookings", ["booking_date"])
    op.create_index("ix_package_bookings_start_date", "package_bookings", ["start_date"])
    op.create_index("ix_package_bookings_status", "package_bookings", ["status"])
    op.create_index("ix_package_bookings_is_deleted", "package_bookings", ["is_deleted"])

    op.create_table(
        "package_booking_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("package_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("package_item_id", sa.Integer(), sa.ForeignKey("package_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("inclusion_type", sa.String(40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_selected", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("reference_module", sa.String(40), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("reference_label", sa.String(150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("billing_source", sa.String(40), nullable=False, server_default="PACKAGE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_package_booking_items_qty_positive"),
    )
    op.create_index("ix_package_booking_items_booking_id", "package_booking_items", ["booking_id"])

    op.create_table(
        "package_booking_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("package_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False, server_default="STATUS_CHANGE"),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("new_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_package_booking_history_booking_id", "package_booking_history", ["booking_id"])

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.alter_column("order_id", existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column("source_module", sa.String(30), nullable=False, server_default="RESTAURANT"))
        batch_op.add_column(sa.Column("source_reference_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("source_reference_number", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("package_booking_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("customer_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"))
        batch_op.add_column(sa.Column("balance_due", sa.Numeric(12, 2), nullable=False, server_default="0.00"))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_invoices_package_booking_id", "package_bookings", ["package_booking_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("fk_invoices_customer_id", "customers", ["customer_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_unique_constraint("uq_invoices_package_booking_id", ["package_booking_id"])
        batch_op.create_index("ix_invoices_source_module", ["source_module"])
        batch_op.create_index("ix_invoices_source_reference_id", ["source_reference_id"])
        batch_op.create_index("ix_invoices_customer_id", ["customer_id"])

    with op.batch_alter_table("payments") as batch_op:
        batch_op.add_column(sa.Column("source_module", sa.String(30), nullable=False, server_default="RESTAURANT"))
        batch_op.add_column(sa.Column("payment_type", sa.String(30), nullable=False, server_default="Full"))
        batch_op.add_column(sa.Column("received_by", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_payments_received_by", "users", ["received_by"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("fk_payments_received_by", type_="foreignkey")
        batch_op.drop_column("received_by")
        batch_op.drop_column("payment_type")
        batch_op.drop_column("source_module")

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.drop_index("ix_invoices_customer_id")
        batch_op.drop_index("ix_invoices_source_reference_id")
        batch_op.drop_index("ix_invoices_source_module")
        batch_op.drop_constraint("uq_invoices_package_booking_id", type_="unique")
        batch_op.drop_constraint("fk_invoices_customer_id", type_="foreignkey")
        batch_op.drop_constraint("fk_invoices_package_booking_id", type_="foreignkey")
        batch_op.drop_column("notes")
        batch_op.drop_column("balance_due")
        batch_op.drop_column("paid_amount")
        batch_op.drop_column("customer_id")
        batch_op.drop_column("package_booking_id")
        batch_op.drop_column("source_reference_number")
        batch_op.drop_column("source_reference_id")
        batch_op.drop_column("source_module")
        batch_op.alter_column("order_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index("ix_package_booking_history_booking_id", table_name="package_booking_history")
    op.drop_table("package_booking_history")

    op.drop_index("ix_package_booking_items_booking_id", table_name="package_booking_items")
    op.drop_table("package_booking_items")

    op.drop_index("ix_package_bookings_is_deleted", table_name="package_bookings")
    op.drop_index("ix_package_bookings_status", table_name="package_bookings")
    op.drop_index("ix_package_bookings_start_date", table_name="package_bookings")
    op.drop_index("ix_package_bookings_booking_date", table_name="package_bookings")
    op.drop_index("ix_package_bookings_customer_id", table_name="package_bookings")
    op.drop_index("ix_package_bookings_package_id", table_name="package_bookings")
    op.drop_index("ix_package_bookings_booking_number", table_name="package_bookings")
    op.drop_index("ix_package_bookings_business_context", table_name="package_bookings")
    op.drop_table("package_bookings")

    op.drop_index("ix_package_blackouts_end_date", table_name="package_blackouts")
    op.drop_index("ix_package_blackouts_start_date", table_name="package_blackouts")
    op.drop_index("ix_package_blackouts_package_id", table_name="package_blackouts")
    op.drop_table("package_blackouts")

    op.drop_index("ix_package_media_package_id", table_name="package_media")
    op.drop_table("package_media")

    op.drop_index("ix_package_items_inclusion_type", table_name="package_items")
    op.drop_index("ix_package_items_package_id", table_name="package_items")
    op.drop_table("package_items")

    op.drop_index("ix_packages_is_deleted", table_name="packages")
    op.drop_index("ix_packages_valid_to", table_name="packages")
    op.drop_index("ix_packages_valid_from", table_name="packages")
    op.drop_index("ix_packages_status", table_name="packages")
    op.drop_index("ix_packages_category", table_name="packages")
    op.drop_index("ix_packages_name", table_name="packages")
    op.drop_index("ix_packages_package_code", table_name="packages")
    op.drop_index("ix_packages_business_context", table_name="packages")
    op.drop_table("packages")
