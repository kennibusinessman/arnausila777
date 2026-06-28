"""drop order/shipment statuses

Заказ и отгрузка больше не имеют жизненного цикла со статусами: заказ создаётся
по факту продажи и сразу списывает остаток (отгрузка создаётся вместе с ним).
Убираем неиспользуемые колонки status и их индексы.

Revision ID: c4e7a1f9b2d3
Revises: 7f3c9a1d2e4b
Create Date: 2026-06-25 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e7a1f9b2d3'
down_revision: str | None = '7f3c9a1d2e4b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_column('orders', 'status')
    op.drop_index('ix_shipments_status', table_name='shipments')
    op.drop_column('shipments', 'status')


def downgrade() -> None:
    op.add_column(
        'shipments',
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'CONFIRMED', 'CANCELLED', name='shipmentstatus',
                    native_enum=False, length=50),
            server_default=sa.text("'DRAFT'"),
            nullable=False,
        ),
    )
    op.create_index('ix_shipments_status', 'shipments', ['status'], unique=False)
    op.add_column(
        'orders',
        sa.Column(
            'status',
            sa.Enum('NEW', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED',
                    name='orderstatus', native_enum=False, length=50),
            server_default=sa.text("'NEW'"),
            nullable=False,
        ),
    )
    op.create_index('ix_orders_status', 'orders', ['status'], unique=False)
