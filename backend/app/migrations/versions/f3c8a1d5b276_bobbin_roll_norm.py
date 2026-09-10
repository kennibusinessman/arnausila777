"""products.roll_norm / roll_product_id: норма выхода рулонов с бабины

Revision ID: f3c8a1d5b276
Revises: e8b4d2c7a913
Create Date: 2026-09-10 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3c8a1d5b276'
down_revision: str | None = 'e8b4d2c7a913'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Карточка бабины: сколько рулонов должно выйти с одной бабины и какое
    # наименование продукции из неё крутят. Обе колонки nullable — у уже
    # заведённых товаров нормы нет, и это допустимо (в отчёте прочерк).
    op.add_column('products', sa.Column('roll_norm', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('roll_product_id', sa.Uuid(), nullable=True))
    op.create_index('ix_products_roll_product_id', 'products', ['roll_product_id'])
    op.create_foreign_key(
        'fk_products_roll_product_id_products',
        'products',
        'products',
        ['roll_product_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_products_roll_product_id_products', 'products', type_='foreignkey')
    op.drop_index('ix_products_roll_product_id', table_name='products')
    op.drop_column('products', 'roll_product_id')
    op.drop_column('products', 'roll_norm')
