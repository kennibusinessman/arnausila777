"""settings singleton (raw material price)

Revision ID: c7d8e9f0a1b2
Revises: e1f2a3b4c5d6
Create Date: 2026-07-01 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: str | None = 'e1f2a3b4c5d6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(
            'raw_price_per_kg',
            sa.Numeric(precision=14, scale=2),
            server_default=sa.text('750'),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Заводим единственную строку настроек с ценой сырья по умолчанию 750 ₸/кг.
    op.execute("INSERT INTO settings (id, raw_price_per_kg) VALUES (1, 750)")


def downgrade() -> None:
    op.drop_table('settings')
