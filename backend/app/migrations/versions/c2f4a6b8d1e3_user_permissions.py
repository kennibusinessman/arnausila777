"""users.permissions: индивидуальные права поверх роли

Revision ID: c2f4a6b8d1e3
Revises: b1a2c3d4e5f6
Create Date: 2026-09-04 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c2f4a6b8d1e3'
down_revision: str | None = 'b1a2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Точечные отклонения от прав роли: {"stock.view": true, "expenses.view": false}.
    # Пустой объект = «права как у роли», поэтому у всех существующих учёток
    # доступ после миграции не меняется.
    op.add_column(
        'users',
        sa.Column(
            'permissions',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'permissions')
