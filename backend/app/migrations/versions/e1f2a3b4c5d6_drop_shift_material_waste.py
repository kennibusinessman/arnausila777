"""drop shift_report_materials.waste_quantity

Сырьё в сменном отчёте имеет только расход (quantity_used). Отдельного «отхода» у
сырья нет — брак/отход учитывается только у выпускаемой продукции
(outputs.defect_quantity).

Revision ID: e1f2a3b4c5d6
Revises: a7c3e9f1b2d4
Create Date: 2026-06-26 04:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: str | None = 'a7c3e9f1b2d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column('shift_report_materials', 'waste_quantity')


def downgrade() -> None:
    op.add_column(
        'shift_report_materials',
        sa.Column('waste_quantity', sa.Numeric(14, 3), nullable=False, server_default='0'),
    )
