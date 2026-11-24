"""add_archive_columns_to_inventory

Revision ID: 34ebce81c90d
Revises: 3e414f1ab515
Create Date: 2026-11-24 07:13:54.992883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34ebce81c90d'
down_revision: Union[str, Sequence[str], None] = '3e414f1ab515'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. purchase_orders
    op.add_column('purchase_orders', sa.Column('is_archived', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('purchase_orders', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('purchase_orders', sa.Column('archived_by_user_id', sa.Integer(), nullable=True))
    op.add_column('purchase_orders', sa.Column('archive_reason', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_purchase_orders_is_archived'), 'purchase_orders', ['is_archived'], unique=False)
    op.create_foreign_key('fk_purchase_orders_archived_by_user_id', 'purchase_orders', 'users', ['archived_by_user_id'], ['id'], ondelete='SET NULL')

    # 2. inventory_items
    op.add_column('inventory_items', sa.Column('is_archived', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('inventory_items', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('inventory_items', sa.Column('archived_by_user_id', sa.Integer(), nullable=True))
    op.add_column('inventory_items', sa.Column('archive_reason', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_inventory_items_is_archived'), 'inventory_items', ['is_archived'], unique=False)
    op.create_foreign_key('fk_inventory_items_archived_by_user_id', 'inventory_items', 'users', ['archived_by_user_id'], ['id'], ondelete='SET NULL')

    # 3. suppliers
    op.add_column('suppliers', sa.Column('is_archived', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('suppliers', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('suppliers', sa.Column('archived_by_user_id', sa.Integer(), nullable=True))
    op.add_column('suppliers', sa.Column('archive_reason', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_suppliers_is_archived'), 'suppliers', ['is_archived'], unique=False)
    op.create_foreign_key('fk_suppliers_archived_by_user_id', 'suppliers', 'users', ['archived_by_user_id'], ['id'], ondelete='SET NULL')

    # 4. recipes
    op.add_column('recipes', sa.Column('is_archived', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('recipes', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('recipes', sa.Column('archived_by_user_id', sa.Integer(), nullable=True))
    op.add_column('recipes', sa.Column('archive_reason', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_recipes_is_archived'), 'recipes', ['is_archived'], unique=False)
    op.create_foreign_key('fk_recipes_archived_by_user_id', 'recipes', 'users', ['archived_by_user_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # 4. recipes
    op.drop_constraint('fk_recipes_archived_by_user_id', 'recipes', type_='foreignkey')
    op.drop_index(op.f('ix_recipes_is_archived'), table_name='recipes')
    op.drop_column('recipes', 'archive_reason')
    op.drop_column('recipes', 'archived_by_user_id')
    op.drop_column('recipes', 'archived_at')
    op.drop_column('recipes', 'is_archived')

    # 3. suppliers
    op.drop_constraint('fk_suppliers_archived_by_user_id', 'suppliers', type_='foreignkey')
    op.drop_index(op.f('ix_suppliers_is_archived'), table_name='suppliers')
    op.drop_column('suppliers', 'archive_reason')
    op.drop_column('suppliers', 'archived_by_user_id')
    op.drop_column('suppliers', 'archived_at')
    op.drop_column('suppliers', 'is_archived')

    # 2. inventory_items
    op.drop_constraint('fk_inventory_items_archived_by_user_id', 'inventory_items', type_='foreignkey')
    op.drop_index(op.f('ix_inventory_items_is_archived'), table_name='inventory_items')
    op.drop_column('inventory_items', 'archive_reason')
    op.drop_column('inventory_items', 'archived_by_user_id')
    op.drop_column('inventory_items', 'archived_at')
    op.drop_column('inventory_items', 'is_archived')

    # 1. purchase_orders
    op.drop_constraint('fk_purchase_orders_archived_by_user_id', 'purchase_orders', type_='foreignkey')
    op.drop_index(op.f('ix_purchase_orders_is_archived'), table_name='purchase_orders')
    op.drop_column('purchase_orders', 'archive_reason')
    op.drop_column('purchase_orders', 'archived_by_user_id')
    op.drop_column('purchase_orders', 'archived_at')
    op.drop_column('purchase_orders', 'is_archived')
