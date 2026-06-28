"""simplify expenses: drop approval workflow + items, add name/responsible

Revision ID: 7f3c9a1d2e4b
Revises: 36140ced5850
Create Date: 2026-06-25 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f3c9a1d2e4b'
down_revision: str | None = '36140ced5850'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Расход — запись по факту, без согласования: добавляем name/responsible_id,
    # убираем status/approved_*/payment_method/supplier_name и позиции закупки.
    op.add_column('expenses', sa.Column('name', sa.String(length=255), nullable=True))
    op.execute("UPDATE expenses SET name = COALESCE(comment, 'Расход')")
    op.alter_column('expenses', 'name', nullable=False)

    op.add_column('expenses', sa.Column('responsible_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_expenses_responsible_id'), 'expenses', ['responsible_id'], unique=False)
    op.create_foreign_key(
        'expenses_responsible_id_fkey', 'expenses', 'users', ['responsible_id'], ['id']
    )

    op.drop_index('ix_expenses_status', table_name='expenses')
    op.drop_constraint('expenses_approved_by_fkey', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'status')
    op.drop_column('expenses', 'approved_by')
    op.drop_column('expenses', 'approved_at')
    op.drop_column('expenses', 'payment_method')
    op.drop_column('expenses', 'supplier_name')

    op.drop_index(op.f('ix_expense_items_expense_id'), table_name='expense_items')
    op.drop_table('expense_items')

    op.drop_column('expense_categories', 'is_inventory_related')


def downgrade() -> None:
    op.add_column(
        'expense_categories',
        sa.Column('is_inventory_related', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )

    op.create_table(
        'expense_items',
        sa.Column('expense_id', sa.Uuid(), nullable=False),
        sa.Column('material_id', sa.Uuid(), nullable=False),
        sa.Column('warehouse_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('unit', sa.String(length=50), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id']),
        sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_expense_items_expense_id'), 'expense_items', ['expense_id'], unique=False)

    op.add_column(
        'expenses',
        sa.Column(
            'payment_method',
            sa.Enum('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER', name='paymentmethod', native_enum=False, length=50),
            nullable=False,
            server_default=sa.text("'CASH'"),
        ),
    )
    op.add_column('expenses', sa.Column('supplier_name', sa.String(length=255), nullable=True))
    op.add_column('expenses', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('expenses', sa.Column('approved_by', sa.Uuid(), nullable=True))
    op.add_column(
        'expenses',
        sa.Column(
            'status',
            sa.Enum(
                'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED',
                name='expensestatus', native_enum=False, length=50,
            ),
            nullable=False,
            server_default=sa.text("'DRAFT'"),
        ),
    )
    op.create_foreign_key('expenses_approved_by_fkey', 'expenses', 'users', ['approved_by'], ['id'])
    op.create_index('ix_expenses_status', 'expenses', ['status'], unique=False)

    op.drop_constraint('expenses_responsible_id_fkey', 'expenses', type_='foreignkey')
    op.drop_index(op.f('ix_expenses_responsible_id'), table_name='expenses')
    op.drop_column('expenses', 'responsible_id')
    op.drop_column('expenses', 'name')
