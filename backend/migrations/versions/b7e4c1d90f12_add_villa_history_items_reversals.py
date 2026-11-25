"""add villa booking status history, invoice items, and payment reversals

Revision ID: b7e4c1d90f12
Revises: 9c3e72b1a640
Create Date: 2026-11-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7e4c1d90f12"
down_revision: Union[str, Sequence[str], None] = "9c3e72b1a640"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "villa_booking_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("villa_stay_bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("new_status", sa.String(30), nullable=False),
        sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_villa_booking_status_history_booking_id", "villa_booking_status_history", ["booking_id"])

    op.create_table(
        "villa_invoice_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("villa_invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_type", sa.String(30), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("villa_stay_bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("service_request_id", sa.Integer(), sa.ForeignKey("villa_service_requests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("invoice_id", "service_request_id", name="uq_villa_invoice_items_invoice_service_req"),
        sa.CheckConstraint("quantity > 0", name="ck_villa_invoice_items_qty_positive"),
    )
    op.create_index("ix_villa_invoice_items_invoice_id", "villa_invoice_items", ["invoice_id"])
    op.create_index("ix_villa_invoice_items_booking_id", "villa_invoice_items", ["booking_id"])
    op.create_index("ix_villa_invoice_items_service_request_id", "villa_invoice_items", ["service_request_id"])

    op.create_table(
        "villa_payment_reversals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("villa_payments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("villa_invoices.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("refund_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("refund_method", sa.String(30), nullable=False),
        sa.Column("refund_reference", sa.String(100), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("reversal_status", sa.String(30), nullable=False, server_default="Refunded"),
        sa.Column("recorded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("refund_amount > 0", name="ck_villa_payment_reversals_amount_positive"),
    )
    op.create_index("ix_villa_payment_reversals_payment_id", "villa_payment_reversals", ["payment_id"])
    op.create_index("ix_villa_payment_reversals_invoice_id", "villa_payment_reversals", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_villa_payment_reversals_invoice_id", table_name="villa_payment_reversals")
    op.drop_index("ix_villa_payment_reversals_payment_id", table_name="villa_payment_reversals")
    op.drop_table("villa_payment_reversals")
    op.drop_index("ix_villa_invoice_items_service_request_id", table_name="villa_invoice_items")
    op.drop_index("ix_villa_invoice_items_booking_id", table_name="villa_invoice_items")
    op.drop_index("ix_villa_invoice_items_invoice_id", table_name="villa_invoice_items")
    op.drop_table("villa_invoice_items")
    op.drop_index("ix_villa_booking_status_history_booking_id", table_name="villa_booking_status_history")
    op.drop_table("villa_booking_status_history")
