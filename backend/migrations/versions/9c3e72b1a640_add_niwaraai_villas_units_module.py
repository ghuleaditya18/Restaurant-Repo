"""add Niwaraai villas and units module

Revision ID: 9c3e72b1a640
Revises: 34ebce81c90d
Create Date: 2026-11-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9c3e72b1a640"
down_revision: Union[str, Sequence[str], None] = "34ebce81c90d"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)]


def upgrade() -> None:
    op.create_table("villas", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("description", sa.Text()), sa.Column("address", sa.Text()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), *timestamps())
    op.create_table("villa_unit_categories", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(80), nullable=False, unique=True), sa.Column("description", sa.Text()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), *timestamps())
    op.create_table("villa_units", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("villa_id", sa.Integer(), sa.ForeignKey("villas.id", ondelete="RESTRICT"), nullable=False), sa.Column("category_id", sa.Integer(), sa.ForeignKey("villa_unit_categories.id", ondelete="RESTRICT"), nullable=False), sa.Column("name", sa.String(100), nullable=False), sa.Column("capacity", sa.Integer(), nullable=False), sa.Column("bedrooms", sa.Integer(), nullable=False, server_default="1"), sa.Column("base_rate", sa.Numeric(12, 2), nullable=False), sa.Column("description", sa.Text()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("housekeeping_status", sa.String(30), nullable=False, server_default="Ready"), sa.UniqueConstraint("villa_id", "name", name="uq_villa_units_villa_name"), sa.CheckConstraint("capacity > 0", name="ck_villa_units_capacity_positive"), sa.CheckConstraint("base_rate > 0", name="ck_villa_units_rate_positive"), *timestamps())
    op.create_index("ix_villa_units_villa_id", "villa_units", ["villa_id"])
    op.create_index("ix_villa_units_category_id", "villa_units", ["category_id"])
    op.create_table("villa_seasonal_rates", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("unit_id", sa.Integer(), sa.ForeignKey("villa_units.id", ondelete="CASCADE"), nullable=False), sa.Column("name", sa.String(100), nullable=False), sa.Column("start_date", sa.Date(), nullable=False), sa.Column("end_date", sa.Date(), nullable=False), sa.Column("nightly_rate", sa.Numeric(12, 2), nullable=False), sa.CheckConstraint("end_date > start_date", name="ck_villa_rates_dates_ordered"), sa.CheckConstraint("nightly_rate > 0", name="ck_villa_rates_amount_positive"), *timestamps())
    op.create_index("ix_villa_seasonal_rates_unit_id", "villa_seasonal_rates", ["unit_id"])
    op.create_table("villa_unit_blocks", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("unit_id", sa.Integer(), sa.ForeignKey("villa_units.id", ondelete="CASCADE"), nullable=False), sa.Column("start_date", sa.Date(), nullable=False), sa.Column("end_date", sa.Date(), nullable=False), sa.Column("reason", sa.String(255), nullable=False), sa.CheckConstraint("end_date > start_date", name="ck_villa_blocks_dates_ordered"), *timestamps())
    op.create_index("ix_villa_unit_blocks_unit_id", "villa_unit_blocks", ["unit_id"])
    op.create_table("villa_stay_bookings", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("booking_number", sa.String(30), nullable=False, unique=True), sa.Column("unit_id", sa.Integer(), sa.ForeignKey("villa_units.id", ondelete="RESTRICT"), nullable=False), sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False), sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("check_in", sa.Date(), nullable=False), sa.Column("check_out", sa.Date(), nullable=False), sa.Column("guests", sa.Integer(), nullable=False), sa.Column("nightly_rate", sa.Numeric(12, 2), nullable=False), sa.Column("total_amount", sa.Numeric(12, 2), nullable=False), sa.Column("status", sa.String(30), nullable=False, server_default="Reserved"), sa.Column("notes", sa.Text()), sa.CheckConstraint("check_out > check_in", name="ck_villa_bookings_dates_ordered"), sa.CheckConstraint("guests > 0", name="ck_villa_bookings_guests_positive"), sa.CheckConstraint("nightly_rate > 0 AND total_amount > 0", name="ck_villa_bookings_amount_positive"), *timestamps())
    op.create_index("ix_villa_stay_bookings_unit_id", "villa_stay_bookings", ["unit_id"])
    op.create_index("ix_villa_stay_bookings_customer_id", "villa_stay_bookings", ["customer_id"])
    op.create_table("villa_services", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("description", sa.Text()), sa.Column("price", sa.Numeric(12, 2), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), *timestamps())
    op.create_table("villa_service_requests", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("booking_id", sa.Integer(), sa.ForeignKey("villa_stay_bookings.id", ondelete="CASCADE"), nullable=False), sa.Column("service_id", sa.Integer(), sa.ForeignKey("villa_services.id", ondelete="RESTRICT"), nullable=False), sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="SET NULL")), sa.Column("unit_price", sa.Numeric(12, 2), nullable=False), sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"), sa.Column("scheduled_for", sa.DateTime(timezone=True)), sa.Column("status", sa.String(30), nullable=False, server_default="Requested"), sa.Column("notes", sa.Text()), *timestamps())
    op.create_index("ix_villa_service_requests_booking_id", "villa_service_requests", ["booking_id"])
    op.create_table("villa_invoices", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("invoice_number", sa.String(30), nullable=False, unique=True), sa.Column("booking_id", sa.Integer(), sa.ForeignKey("villa_stay_bookings.id", ondelete="RESTRICT"), nullable=False, unique=True), sa.Column("subtotal", sa.Numeric(12, 2), nullable=False), sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="18.00"), sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False), sa.Column("total_amount", sa.Numeric(12, 2), nullable=False), sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"), sa.Column("payment_status", sa.String(30), nullable=False, server_default="Pending"), sa.Column("is_finalized", sa.Boolean(), nullable=False, server_default=sa.false()), *timestamps())
    op.create_index("ix_villa_invoices_booking_id", "villa_invoices", ["booking_id"])
    op.create_table("villa_payments", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("villa_invoices.id", ondelete="RESTRICT"), nullable=False), sa.Column("amount", sa.Numeric(12, 2), nullable=False), sa.Column("method", sa.String(30), nullable=False), sa.Column("reference", sa.String(100)), sa.Column("received_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.CheckConstraint("amount > 0", name="ck_villa_payments_amount_positive"), *timestamps())
    op.create_index("ix_villa_payments_invoice_id", "villa_payments", ["invoice_id"])


def downgrade() -> None:
    op.drop_table("villa_payments")
    op.drop_table("villa_invoices")
    op.drop_table("villa_service_requests")
    op.drop_table("villa_services")
    op.drop_table("villa_stay_bookings")
    op.drop_table("villa_unit_blocks")
    op.drop_table("villa_seasonal_rates")
    op.drop_table("villa_units")
    op.drop_table("villa_unit_categories")
    op.drop_table("villas")
