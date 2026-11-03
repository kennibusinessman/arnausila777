"""production_tasks + settings.sheets_per_shift/shifts_per_day: план производства простыней

Revision ID: b3d5f7a9c1e2
Revises: a9d3e5f7b2c4
Create Date: 2026-11-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d5f7a9c1e2'
down_revision: str | None = 'a9d3e5f7b2c4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'production_tasks',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=False),
        sa.Column('bobbin_id', sa.Uuid(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('allocated', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('client_name', sa.String(length=255), nullable=True),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default=sa.text("'QUEUED'"), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('quantity > 0', name='ck_production_tasks_quantity_positive'),
        sa.CheckConstraint('allocated >= 0', name='ck_production_tasks_allocated_nonneg'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['bobbin_id'], ['products.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_production_tasks_product_id', 'production_tasks', ['product_id'])
    op.create_index(
        'ix_production_tasks_status_position', 'production_tasks', ['status', 'position']
    )
    # Выработка линии простыней: 360 шт за 12-часовую смену, две смены в сутки.
    op.add_column(
        'settings',
        sa.Column('sheets_per_shift', sa.Integer(), server_default=sa.text('360'), nullable=False),
    )
    op.add_column(
        'settings',
        sa.Column('shifts_per_day', sa.Integer(), server_default=sa.text('2'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('settings', 'shifts_per_day')
    op.drop_column('settings', 'sheets_per_shift')
    op.drop_index('ix_production_tasks_status_position', table_name='production_tasks')
    op.drop_index('ix_production_tasks_product_id', table_name='production_tasks')
    op.drop_table('production_tasks')
