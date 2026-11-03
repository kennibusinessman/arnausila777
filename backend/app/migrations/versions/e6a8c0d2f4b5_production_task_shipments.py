"""production_task_shipments: отгрузки по заказам, засчитанные в план производства

Revision ID: e6a8c0d2f4b5
Revises: d5f7b9c1e3a4
Create Date: 2026-11-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6a8c0d2f4b5'
down_revision: str | None = 'd5f7b9c1e3a4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'production_task_shipments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('item_id', sa.Uuid(), nullable=False),
        sa.Column('order_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('ready_added', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('quantity > 0', name='ck_production_task_shipments_quantity_positive'),
        sa.CheckConstraint('ready_added >= 0', name='ck_production_task_shipments_ready_added'),
        sa.ForeignKeyConstraint(['item_id'], ['production_task_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_production_task_shipments_item_id', 'production_task_shipments', ['item_id'])
    op.create_index('ix_production_task_shipments_order_id', 'production_task_shipments', ['order_id'])


def downgrade() -> None:
    op.drop_index('ix_production_task_shipments_order_id', table_name='production_task_shipments')
    op.drop_index('ix_production_task_shipments_item_id', table_name='production_task_shipments')
    op.drop_table('production_task_shipments')
