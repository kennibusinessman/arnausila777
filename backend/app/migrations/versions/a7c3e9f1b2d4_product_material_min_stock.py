"""product and material min_stock

Порог низкого остатка для товаров и сырья. Если остаток ≤ min_stock (и min_stock > 0),
позиция показывается со статусом «Заканчивается» в разделе «Остатки».

Revision ID: a7c3e9f1b2d4
Revises: f6a1c2d3e4b5
Create Date: 2026-06-25 19:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e9f1b2d4'
down_revision: str | None = 'f6a1c2d3e4b5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ('products', 'materials'):
        op.add_column(
            table,
            sa.Column('min_stock', sa.Numeric(14, 3), nullable=False, server_default='0'),
        )


def downgrade() -> None:
    for table in ('products', 'materials'):
        op.drop_column(table, 'min_stock')
