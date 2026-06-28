"""shift report downtime hours

Добавляет в сменный отчёт поле downtime_hours — количество часов простоя за смену,
которое указывает мастер при создании отчёта.

Revision ID: f6a1c2d3e4b5
Revises: d5b8e2c1a6f4
Create Date: 2026-06-25 18:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a1c2d3e4b5'
down_revision: str | None = 'd5b8e2c1a6f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'shift_reports',
        sa.Column(
            'downtime_hours',
            sa.Numeric(6, 2),
            nullable=False,
            server_default='0',
        ),
    )


def downgrade() -> None:
    op.drop_column('shift_reports', 'downtime_hours')
