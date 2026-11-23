"""composite_unique_context_entity_image

Revision ID: 3e414f1ab515
Revises: 2569217d24d3
Create Date: 2026-11-23 19:18:12.187770

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e414f1ab515'
down_revision: Union[str, Sequence[str], None] = '2569217d24d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: replace (entity_type, entity_id) with (business_context, entity_type, entity_id) unique constraint."""
    op.drop_index('uq_entity_images_type_id', table_name='entity_images')
    op.create_index(
        'uq_entity_images_context_type_id',
        'entity_images',
        ['business_context', 'entity_type', 'entity_id'],
        unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_entity_images_context_type_id', table_name='entity_images')
    op.create_index(
        'uq_entity_images_type_id',
        'entity_images',
        ['entity_type', 'entity_id'],
        unique=True
    )
