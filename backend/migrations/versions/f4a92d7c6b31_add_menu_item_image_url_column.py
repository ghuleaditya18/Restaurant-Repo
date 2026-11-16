"""Add the menu item image URL column.

Revision ID: f4a92d7c6b31
Revises: e97ccb93567c
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a92d7c6b31"
down_revision: Union[str, Sequence[str], None] = "e97ccb93567c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "menu_items",
        sa.Column("image_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("menu_items", "image_url")
