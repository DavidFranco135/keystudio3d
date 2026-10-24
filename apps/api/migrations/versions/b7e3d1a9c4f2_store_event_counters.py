"""store whatsapp click counter and product view counters

Revision ID: b7e3d1a9c4f2
Revises: a9d2c5e8f1b3
Create Date: 2026-10-24 15:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b7e3d1a9c4f2'
down_revision: str | None = 'a9d2c5e8f1b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'store_visit_days',
        sa.Column('whatsapp_clicks', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_table(
        'store_product_days',
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('day', sa.String(length=10), nullable=False),
        sa.Column('product_id', sa.String(length=64), nullable=False),
        sa.Column('views', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('organization_id', 'day', 'product_id'),
    )


def downgrade() -> None:
    op.drop_table('store_product_days')
    op.drop_column('store_visit_days', 'whatsapp_clicks')
