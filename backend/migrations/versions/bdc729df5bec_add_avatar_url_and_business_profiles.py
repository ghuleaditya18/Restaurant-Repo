"""add_avatar_url_and_business_profiles

Revision ID: bdc729df5bec
Revises: 425b4608eada
Create Date: 2026-11-23 14:26:15.461060

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bdc729df5bec'
down_revision: Union[str, Sequence[str], None] = '425b4608eada'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add avatar_url to users table
    op.add_column('users', sa.Column('avatar_url', sa.String(length=255), nullable=True))

    # 2. Create business_profiles table
    op.create_table(
        'business_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_context', sa.String(length=50), nullable=False),
        sa.Column('business_name', sa.String(length=150), nullable=False),
        sa.Column('business_type', sa.String(length=100), nullable=True),
        sa.Column('business_category', sa.String(length=100), nullable=True),
        sa.Column('tagline', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('established_year', sa.String(length=10), nullable=True),
        sa.Column('story_heading', sa.String(length=200), nullable=True),
        sa.Column('story_subheading', sa.String(length=255), nullable=True),
        sa.Column('story_content', sa.Text(), nullable=True),
        sa.Column('founder_name', sa.String(length=150), nullable=True),
        sa.Column('founder_designation', sa.String(length=100), nullable=True),
        sa.Column('founder_bio', sa.Text(), nullable=True),
        sa.Column('founder_quote', sa.String(length=255), nullable=True),
        sa.Column('founder_image_url', sa.String(length=255), nullable=True),
        sa.Column('business_email', sa.String(length=150), nullable=True),
        sa.Column('business_phone', sa.String(length=50), nullable=True),
        sa.Column('address_line', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('state', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True, server_default='India'),
        sa.Column('operating_hours', sa.String(length=100), nullable=True),
        sa.Column('weekly_closed_days', sa.String(length=100), nullable=True),
        sa.Column('business_highlights', sa.Text(), nullable=True),
        sa.Column('is_profile_complete', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_business_profiles_id'), 'business_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_business_profiles_business_context'), 'business_profiles', ['business_context'], unique=True)

    # 3. Insert baseline business context records without fabricated personal details
    op.execute(
        sa.text(
            "INSERT INTO business_profiles (business_context, business_name, is_profile_complete) "
            "VALUES ('RESTAURANT', 'DineFlow Restaurant', false), "
            "       ('SPA', 'DineFlow Spa', false) "
            "ON CONFLICT (business_context) DO NOTHING;"
        )
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_business_profiles_business_context'), table_name='business_profiles')
    op.drop_index(op.f('ix_business_profiles_id'), table_name='business_profiles')
    op.drop_table('business_profiles')
    op.drop_column('users', 'avatar_url')
