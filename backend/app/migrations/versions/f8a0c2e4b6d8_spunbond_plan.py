"""План спанбонда: вид задания (линия) и выработка линии спанбонда

Revision ID: f8a0c2e4b6d8
Revises: e6a8c0d2f4b5
Create Date: 2026-11-04 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a0c2e4b6d8'
down_revision: str | None = 'e6a8c0d2f4b5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Все существующие задания — простыни.
    op.add_column(
        'production_tasks',
        sa.Column('kind', sa.String(length=50), server_default=sa.text("'SHEETS'"), nullable=False),
    )
    op.create_index('ix_production_tasks_kind', 'production_tasks', ['kind'])
    op.add_column(
        'settings',
        sa.Column('spunbond_kg_per_shift', sa.Integer(), server_default=sa.text('1000'), nullable=False),
    )
    op.add_column(
        'settings',
        sa.Column('spunbond_shifts_per_day', sa.Integer(), server_default=sa.text('2'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('settings', 'spunbond_shifts_per_day')
    op.drop_column('settings', 'spunbond_kg_per_shift')
    op.drop_index('ix_production_tasks_kind', table_name='production_tasks')
    op.drop_column('production_tasks', 'kind')
