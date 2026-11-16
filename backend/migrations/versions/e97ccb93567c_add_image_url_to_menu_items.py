"""add image_url to menu_items

Revision ID: e97ccb93567c
Revises: d1ec4fa60b88
Create Date: 2026-11-16 16:11:31.591832

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e97ccb93567c'
down_revision: Union[str, Sequence[str], None] = 'd1ec4fa60b88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # This revision was already applied to some databases as an empty revision.
    # Keep it empty; add the column in the follow-up migration.
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
