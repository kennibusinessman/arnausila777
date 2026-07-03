"""expense.order_id: авто-расход себестоимости сырья по заказу

Revision ID: b1a2c3d4e5f6
Revises: c7d8e9f0a1b2
Create Date: 2026-07-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1a2c3d4e5f6'
down_revision: str | None = 'c7d8e9f0a1b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Ссылка на заказ у расхода: непустая → авто-расход себестоимости сырья,
    # синхронизируется с заказом (order_service). Ручная правка/удаление таких
    # расходов запрещены, чтобы сумма не разошлась с заказом.
    op.add_column('expenses', sa.Column('order_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_expenses_order_id'), 'expenses', ['order_id'], unique=False)
    op.create_foreign_key('expenses_order_id_fkey', 'expenses', 'orders', ['order_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('expenses_order_id_fkey', 'expenses', type_='foreignkey')
    op.drop_index(op.f('ix_expenses_order_id'), table_name='expenses')
    op.drop_column('expenses', 'order_id')
