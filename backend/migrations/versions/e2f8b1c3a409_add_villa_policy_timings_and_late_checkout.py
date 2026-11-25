"""add villa policy timings, actual stay timestamps, and late checkout constraint

Revision ID: e2f8b1c3a409
Revises: d8f2a9c41b07
Create Date: 2026-11-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e2f8b1c3a409"
down_revision: Union[str, Sequence[str], None] = "d8f2a9c41b07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "villa_property_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("default_check_in_time", sa.String(5), nullable=False, server_default="14:00"),
        sa.Column("default_check_out_time", sa.String(5), nullable=False, server_default="11:00"),
        sa.Column("late_checkout_grace_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("default_late_checkout_fee", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("late_checkout_grace_minutes >= 0", name="ck_villa_settings_grace_nonneg"),
        sa.CheckConstraint(
            "default_late_checkout_fee IS NULL OR default_late_checkout_fee >= 0",
            name="ck_villa_settings_fee_nonneg",
        ),
    )

    with op.batch_alter_table("villas") as batch_op:
        batch_op.add_column(sa.Column("check_in_time", sa.String(5), nullable=True))
        batch_op.add_column(sa.Column("check_out_time", sa.String(5), nullable=True))
        batch_op.add_column(sa.Column("late_checkout_fee", sa.Numeric(12, 2), nullable=True))
        batch_op.create_check_constraint(
            "ck_villas_late_fee_nonneg",
            "late_checkout_fee IS NULL OR late_checkout_fee >= 0",
        )

    with op.batch_alter_table("villa_units") as batch_op:
        batch_op.add_column(sa.Column("check_in_time", sa.String(5), nullable=True))
        batch_op.add_column(sa.Column("check_out_time", sa.String(5), nullable=True))
        batch_op.add_column(sa.Column("late_checkout_fee", sa.Numeric(12, 2), nullable=True))
        batch_op.create_check_constraint(
            "ck_villa_units_late_fee_nonneg",
            "late_checkout_fee IS NULL OR late_checkout_fee >= 0",
        )

    op.add_column(
        "villa_stay_bookings",
        sa.Column("actual_check_in_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "villa_stay_bookings",
        sa.Column("actual_check_out_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "uq_villa_invoice_items_late_checkout",
        "villa_invoice_items",
        ["invoice_id"],
        unique=True,
        sqlite_where=sa.text("item_type = 'LATE_CHECKOUT'"),
        postgresql_where=sa.text("item_type = 'LATE_CHECKOUT'"),
    )

    # Seed initial default property timing policy row (unconfigured fee = NULL)
    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT id FROM villa_property_settings LIMIT 1")).fetchone()
    if not existing:
        conn.execute(
            sa.text(
                "INSERT INTO villa_property_settings "
                "(default_check_in_time, default_check_out_time, late_checkout_grace_minutes, default_late_checkout_fee) "
                "VALUES ('14:00', '11:00', 30, NULL)"
            )
        )


def downgrade() -> None:
    op.drop_index("uq_villa_invoice_items_late_checkout", table_name="villa_invoice_items")
    op.drop_column("villa_stay_bookings", "actual_check_out_at")
    op.drop_column("villa_stay_bookings", "actual_check_in_at")

    with op.batch_alter_table("villa_units") as batch_op:
        batch_op.drop_constraint("ck_villa_units_late_fee_nonneg", type_="check")
        batch_op.drop_column("late_checkout_fee")
        batch_op.drop_column("check_out_time")
        batch_op.drop_column("check_in_time")

    with op.batch_alter_table("villas") as batch_op:
        batch_op.drop_constraint("ck_villas_late_fee_nonneg", type_="check")
        batch_op.drop_column("late_checkout_fee")
        batch_op.drop_column("check_out_time")
        batch_op.drop_column("check_in_time")

    op.drop_table("villa_property_settings")
