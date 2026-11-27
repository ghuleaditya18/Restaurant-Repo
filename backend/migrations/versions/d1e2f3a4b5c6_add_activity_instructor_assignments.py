"""add activity instructor assignments table

Revision ID: d1e2f3a4b5c6
Revises: c8d4e9f12a30
Create Date: 2026-11-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c8d4e9f12a30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_instructor_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "staff_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activity_id",
            sa.Integer(),
            sa.ForeignKey("activities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("specialty_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("staff_user_id", "activity_id", name="uq_act_instructor_activity"),
    )
    op.create_index(
        "ix_activity_instructor_assignments_id",
        "activity_instructor_assignments",
        ["id"],
    )
    op.create_index(
        "ix_activity_instructor_assignments_staff_user_id",
        "activity_instructor_assignments",
        ["staff_user_id"],
    )
    op.create_index(
        "ix_activity_instructor_assignments_activity_id",
        "activity_instructor_assignments",
        ["activity_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_activity_instructor_assignments_activity_id", table_name="activity_instructor_assignments")
    op.drop_index("ix_activity_instructor_assignments_staff_user_id", table_name="activity_instructor_assignments")
    op.drop_index("ix_activity_instructor_assignments_id", table_name="activity_instructor_assignments")
    op.drop_table("activity_instructor_assignments")
