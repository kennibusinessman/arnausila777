"""products/materials.created_by: кто завёл позицию

Revision ID: e8b4d2c7a913
Revises: c2f4a6b8d1e3
Create Date: 2026-09-10 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b4d2c7a913'
down_revision: str | None = 'c2f4a6b8d1e3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Автор позиции справочника. Товар заводит не только SA (мастер смены создаёт
    # его прямо из сменного отчёта), поэтому автора нужно хранить явно.
    # Колонка nullable: у позиций, заведённых до миграции, автор неизвестен —
    # создание товара/сырья раньше нигде не фиксировалось, восстановить неоткуда.
    for table in ("products", "materials"):
        op.add_column(table, sa.Column('created_by', sa.Uuid(), nullable=True))
        op.create_index(f'ix_{table}_created_by', table, ['created_by'])
        op.create_foreign_key(
            f'fk_{table}_created_by_users', table, 'users', ['created_by'], ['id']
        )


def downgrade() -> None:
    for table in ("products", "materials"):
        op.drop_constraint(f'fk_{table}_created_by_users', table, type_='foreignkey')
        op.drop_index(f'ix_{table}_created_by', table_name=table)
        op.drop_column(table, 'created_by')
