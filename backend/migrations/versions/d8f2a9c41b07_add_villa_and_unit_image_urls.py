"""add image_url columns to villas and villa_units

Revision ID: d8f2a9c41b07
Revises: c4a91f3e8201
Create Date: 2026-11-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d8f2a9c41b07"
down_revision: Union[str, Sequence[str], None] = "c4a91f3e8201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("villas", sa.Column("image_url", sa.String(500), nullable=True))
    op.add_column("villa_units", sa.Column("image_url", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("villa_units") as batch_op:
        batch_op.drop_column("image_url")
    with op.batch_alter_table("villas") as batch_op:
        batch_op.drop_column("image_url")
