"""production_task_items: задание плана — несколько позиций с «готово» и «отгружено»

Revision ID: d5f7b9c1e3a4
Revises: c4e6a8b0d2f3
Create Date: 2026-11-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f7b9c1e3a4'
down_revision: str | None = 'c4e6a8b0d2f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'production_task_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('task_id', sa.Uuid(), nullable=False),
        sa.Column('line_no', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=False),
        sa.Column('bobbin_id', sa.Uuid(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('ready', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('shipped', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('quantity > 0', name='ck_production_task_items_quantity_positive'),
        sa.CheckConstraint('ready >= 0 AND ready <= quantity', name='ck_production_task_items_ready'),
        sa.CheckConstraint('shipped >= 0 AND shipped <= ready', name='ck_production_task_items_shipped'),
        sa.ForeignKeyConstraint(['task_id'], ['production_tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['bobbin_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_production_task_items_task_id', 'production_task_items', ['task_id'])
    op.create_index('ix_production_task_items_product_id', 'production_task_items', ['product_id'])

    # Каждое прежнее задание становится заданием с одной позицией.
    # «Отдано клиенту» (DONE) раньше значило, что закреплённое уже отгружено.
    op.execute(
        """
        INSERT INTO production_task_items
            (id, task_id, line_no, product_id, bobbin_id, quantity, ready, shipped,
             created_at, updated_at)
        SELECT gen_random_uuid(), id, 1, product_id, bobbin_id, quantity,
               LEAST(allocated, quantity),
               CASE WHEN status = 'DONE' THEN LEAST(allocated, quantity) ELSE 0 END,
               created_at, updated_at
        FROM production_tasks
        """
    )
    op.drop_index('ix_production_tasks_product_id', table_name='production_tasks')
    op.drop_constraint('ck_production_tasks_allocated_nonneg', 'production_tasks', type_='check')
    op.drop_constraint('ck_production_tasks_quantity_positive', 'production_tasks', type_='check')
    for column in ('product_id', 'bobbin_id', 'quantity', 'allocated'):
        op.drop_column('production_tasks', column)


def downgrade() -> None:
    op.add_column('production_tasks', sa.Column('product_id', sa.Uuid(), nullable=True))
    op.add_column('production_tasks', sa.Column('bobbin_id', sa.Uuid(), nullable=True))
    op.add_column('production_tasks', sa.Column('quantity', sa.Integer(), nullable=True))
    op.add_column(
        'production_tasks',
        sa.Column('allocated', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )
    # Обратно влезает только первая позиция задания.
    op.execute(
        """
        UPDATE production_tasks t
        SET product_id = i.product_id, bobbin_id = i.bobbin_id,
            quantity = i.quantity, allocated = i.ready
        FROM production_task_items i
        WHERE i.task_id = t.id AND i.line_no = 1
        """
    )
    op.execute("DELETE FROM production_tasks WHERE product_id IS NULL")
    op.alter_column('production_tasks', 'product_id', nullable=False)
    op.alter_column('production_tasks', 'quantity', nullable=False)
    op.create_foreign_key(None, 'production_tasks', 'products', ['product_id'], ['id'])
    op.create_foreign_key(None, 'production_tasks', 'products', ['bobbin_id'], ['id'])
    op.create_check_constraint(
        'ck_production_tasks_quantity_positive', 'production_tasks', 'quantity > 0'
    )
    op.create_check_constraint(
        'ck_production_tasks_allocated_nonneg', 'production_tasks', 'allocated >= 0'
    )
    op.create_index('ix_production_tasks_product_id', 'production_tasks', ['product_id'])
    op.drop_index('ix_production_task_items_product_id', table_name='production_task_items')
    op.drop_index('ix_production_task_items_task_id', table_name='production_task_items')
    op.drop_table('production_task_items')
