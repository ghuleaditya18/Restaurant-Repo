"""add_order_archive_fields_and_widen_payment_status

Revision ID: e0ca17c0a898
Revises: bdc729df5bec
Create Date: 2026-11-23 15:47:56.265680

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0ca17c0a898'
down_revision: Union[str, Sequence[str], None] = 'bdc729df5bec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add archive fields to orders
    op.add_column('orders', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('archived_by', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_orders_archived_by_users',
        'orders',
        'users',
        ['archived_by'],
        ['id'],
        ondelete='SET NULL'
    )
    op.add_column('orders', sa.Column('archive_reason', sa.String(length=255), nullable=True))

    # 2. Widen payment_status in invoices to VARCHAR(30)
    op.alter_column(
        'invoices',
        'payment_status',
        existing_type=sa.VARCHAR(length=7),
        type_=sa.String(length=30),
        existing_nullable=False
    )

    # 3. Widen status in payments to VARCHAR(30)
    op.alter_column(
        'payments',
        'status',
        existing_type=sa.VARCHAR(length=7),
        type_=sa.String(length=30),
        existing_nullable=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'payments',
        'status',
        existing_type=sa.String(length=30),
        type_=sa.VARCHAR(length=7),
        existing_nullable=False
    )
    op.alter_column(
        'invoices',
        'payment_status',
        existing_type=sa.String(length=30),
        type_=sa.VARCHAR(length=7),
        existing_nullable=False
    )
    op.drop_constraint('fk_orders_archived_by_users', 'orders', type_='foreignkey')
    op.drop_column('orders', 'archive_reason')
    op.drop_column('orders', 'archived_by')
    op.drop_column('orders', 'archived_at')
