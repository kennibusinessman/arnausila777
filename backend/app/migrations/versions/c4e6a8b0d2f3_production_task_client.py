"""production_tasks.client_id: клиент задания из справочника вместо текста

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
Create Date: 2026-11-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e6a8b0d2f3'
down_revision: str | None = 'b3d5f7a9c1e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('production_tasks', sa.Column('client_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_production_tasks_client_id', 'production_tasks', 'clients', ['client_id'], ['id']
    )
    op.create_index('ix_production_tasks_client_id', 'production_tasks', ['client_id'])
    # Имена, введённые текстом, сопоставляем с клиентами справочника.
    op.execute(
        """
        UPDATE production_tasks t
        SET client_id = c.id
        FROM clients c
        WHERE c.deleted_at IS NULL
          AND t.client_name IS NOT NULL
          AND lower(trim(c.name)) = lower(trim(t.client_name))
        """
    )
    op.drop_column('production_tasks', 'client_name')


def downgrade() -> None:
    op.add_column(
        'production_tasks', sa.Column('client_name', sa.String(length=255), nullable=True)
    )
    op.execute(
        """
        UPDATE production_tasks t SET client_name = c.name
        FROM clients c WHERE c.id = t.client_id
        """
    )
    op.drop_index('ix_production_tasks_client_id', table_name='production_tasks')
    op.drop_constraint('fk_production_tasks_client_id', 'production_tasks', type_='foreignkey')
    op.drop_column('production_tasks', 'client_id')
