"""add villa guests table, unit block categorization, and stay booking guest_id

Revision ID: c4a91f3e8201
Revises: b7e4c1d90f12
Create Date: 2026-11-25
"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision: str = "c4a91f3e8201"
down_revision: Union[str, Sequence[str], None] = "b7e4c1d90f12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "villa_guests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("guest_reference", sa.String(30), nullable=False, unique=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("email", sa.String(150), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("country", sa.String(100), nullable=True, server_default="India"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("preferences", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_villa_guests_full_name", "villa_guests", ["full_name"])
    op.create_index("ix_villa_guests_phone", "villa_guests", ["phone"])
    op.create_index("ix_villa_guests_email", "villa_guests", ["email"])

    op.add_column(
        "villa_unit_blocks",
        sa.Column("block_type", sa.String(30), nullable=False, server_default="Maintenance"),
    )
    op.add_column(
        "villa_unit_blocks",
        sa.Column("description", sa.Text(), nullable=True),
    )

    with op.batch_alter_table("villa_stay_bookings") as batch_op:
        batch_op.add_column(sa.Column("guest_id", sa.Integer(), nullable=True))
        batch_op.alter_column("customer_id", existing_type=sa.Integer(), nullable=True)
        batch_op.create_index("ix_villa_stay_bookings_guest_id", ["guest_id"])
        batch_op.create_foreign_key(
            "fk_villa_stay_bookings_guest_id",
            "villa_guests",
            ["guest_id"],
            ["id"],
            ondelete="RESTRICT",
        )

    # Preserve and backfill any legacy villa bookings linked to customers
    conn = op.get_bind()
    legacy_rows = conn.execute(
        sa.text(
            "SELECT DISTINCT c.id, c.full_name, c.phone, c.email, c.address "
            "FROM customers c "
            "JOIN villa_stay_bookings b ON b.customer_id = c.id "
            "WHERE b.guest_id IS NULL"
        )
    ).fetchall()

    for cust_id, full_name, phone, email, address in legacy_rows:
        existing_guest = conn.execute(
            sa.text("SELECT id FROM villa_guests WHERE phone = :phone"),
            {"phone": phone},
        ).fetchone()
        if existing_guest:
            guest_id = existing_guest[0]
        else:
            ref = f"V-GST-{uuid4().hex[:8].upper()}"
            conn.execute(
                sa.text(
                    "INSERT INTO villa_guests (guest_reference, full_name, phone, email, address, country, is_active) "
                    "VALUES (:ref, :full_name, :phone, :email, :address, 'India', :active)"
                ),
                {
                    "ref": ref,
                    "full_name": full_name,
                    "phone": phone,
                    "email": email,
                    "address": address,
                    "active": True,
                },
            )
            guest_id = conn.execute(
                sa.text("SELECT id FROM villa_guests WHERE guest_reference = :ref"),
                {"ref": ref},
            ).scalar_one()

        conn.execute(
            sa.text("UPDATE villa_stay_bookings SET guest_id = :gid WHERE customer_id = :cid AND guest_id IS NULL"),
            {"gid": guest_id, "cid": cust_id},
        )


def downgrade() -> None:
    with op.batch_alter_table("villa_stay_bookings") as batch_op:
        batch_op.drop_constraint("fk_villa_stay_bookings_guest_id", type_="foreignkey")
        batch_op.drop_index("ix_villa_stay_bookings_guest_id")
        batch_op.drop_column("guest_id")
        batch_op.alter_column("customer_id", existing_type=sa.Integer(), nullable=False)

    op.drop_column("villa_unit_blocks", "description")
    op.drop_column("villa_unit_blocks", "block_type")
    op.drop_index("ix_villa_guests_email", table_name="villa_guests")
    op.drop_index("ix_villa_guests_phone", table_name="villa_guests")
    op.drop_index("ix_villa_guests_full_name", table_name="villa_guests")
    op.drop_table("villa_guests")
