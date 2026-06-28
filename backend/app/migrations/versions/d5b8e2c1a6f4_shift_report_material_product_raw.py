"""shift report raw line can reference a product

Расход сырья в сменном отчёте теперь может ссылаться либо на материал
(material_id, напр. Полипропилен), либо на товар-полуфабрикат (product_id,
спанбонд: Бабины / Дастархан сырьё), который списывается со склада готовой
продукции. Делаем material_id необязательным, добавляем product_id и CHECK,
что заполнено ровно одно из двух.

Revision ID: d5b8e2c1a6f4
Revises: c4e7a1f9b2d3
Create Date: 2026-06-25 12:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5b8e2c1a6f4'
down_revision: str | None = 'c4e7a1f9b2d3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column('shift_report_materials', 'material_id', existing_type=sa.Uuid(), nullable=True)
    op.add_column('shift_report_materials', sa.Column('product_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_shift_report_materials_product_id_products',
        'shift_report_materials',
        'products',
        ['product_id'],
        ['id'],
    )
    op.create_check_constraint(
        'ck_shift_report_materials_one_ref',
        'shift_report_materials',
        '(material_id IS NOT NULL AND product_id IS NULL) '
        'OR (material_id IS NULL AND product_id IS NOT NULL)',
    )


def downgrade() -> None:
    op.drop_constraint('ck_shift_report_materials_one_ref', 'shift_report_materials', type_='check')
    op.drop_constraint(
        'fk_shift_report_materials_product_id_products', 'shift_report_materials', type_='foreignkey'
    )
    op.drop_column('shift_report_materials', 'product_id')
    op.alter_column('shift_report_materials', 'material_id', existing_type=sa.Uuid(), nullable=False)
