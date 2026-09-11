"""inventories / inventory_lines: история инвентаризаций

Revision ID: a9d3e5f7b2c4
Revises: f3c8a1d5b276
Create Date: 2026-09-11 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9d3e5f7b2c4'
down_revision: str | None = 'f3c8a1d5b276'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ITEM_XOR = (
    "(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR "
    "(item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)"
)


def upgrade() -> None:
    # Документ «одна инвентаризация» и его строки «было → стало». Только новые
    # таблицы — существующие данные не трогаем. Инвентаризации, проведённые до
    # этой миграции, остаются лишь в журнале движений (документа у них нет).
    op.create_table(
        'inventories',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_inventories_created_at', 'inventories', ['created_at'])

    op.create_table(
        'inventory_lines',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('inventory_id', sa.Uuid(), nullable=False),
        sa.Column('item_type', sa.Enum('PRODUCT', 'MATERIAL', name='itemtype', native_enum=False, length=50), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=True),
        sa.Column('material_id', sa.Uuid(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('unit', sa.String(length=50), nullable=False),
        sa.Column('quantity_before', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('quantity_after', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.CheckConstraint(_ITEM_XOR, name='ck_inventory_lines_item_xor'),
        sa.ForeignKeyConstraint(['inventory_id'], ['inventories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_inventory_lines_inventory', 'inventory_lines', ['inventory_id'])


def downgrade() -> None:
    op.drop_index('ix_inventory_lines_inventory', table_name='inventory_lines')
    op.drop_table('inventory_lines')
    op.drop_index('ix_inventories_created_at', table_name='inventories')
    op.drop_table('inventories')
