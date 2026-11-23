"""add_entity_images_and_image_urls

Revision ID: 2569217d24d3
Revises: a6b766bd276d
Create Date: 2026-11-23 18:29:48.613235

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2569217d24d3'
down_revision: Union[str, Sequence[str], None] = 'a6b766bd276d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('entity_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('business_context', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('image_data', sa.LargeBinary(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('checksum', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_entity_images_business_context'), 'entity_images', ['business_context'], unique=False)
    op.create_index(op.f('ix_entity_images_entity_id'), 'entity_images', ['entity_id'], unique=False)
    op.create_index(op.f('ix_entity_images_entity_type'), 'entity_images', ['entity_type'], unique=False)
    op.create_index(op.f('ix_entity_images_id'), 'entity_images', ['id'], unique=False)
    op.create_index('uq_entity_images_type_id', 'entity_images', ['entity_type', 'entity_id'], unique=True)

    op.add_column('customers', sa.Column('image_url', sa.String(length=255), nullable=True))
    op.add_column('staff', sa.Column('image_url', sa.String(length=255), nullable=True))
    op.add_column('spa_customers', sa.Column('image_url', sa.String(length=255), nullable=True))
    op.add_column('spa_staff', sa.Column('image_url', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('spa_staff', 'image_url')
    op.drop_column('spa_customers', 'image_url')
    op.drop_column('staff', 'image_url')
    op.drop_column('customers', 'image_url')

    op.drop_index('uq_entity_images_type_id', table_name='entity_images')
    op.drop_index(op.f('ix_entity_images_id'), table_name='entity_images')
    op.drop_index(op.f('ix_entity_images_entity_type'), table_name='entity_images')
    op.drop_index(op.f('ix_entity_images_entity_id'), table_name='entity_images')
    op.drop_index(op.f('ix_entity_images_business_context'), table_name='entity_images')
    op.drop_table('entity_images')
