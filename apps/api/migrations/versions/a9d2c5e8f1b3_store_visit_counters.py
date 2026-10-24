"""store visit counters and visitor presence

Revision ID: a9d2c5e8f1b3
Revises: c4e7a1d9b2f6
Create Date: 2026-10-24 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a9d2c5e8f1b3'
down_revision: str | None = 'c4e7a1d9b2f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'store_visit_days',
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('day', sa.String(length=10), nullable=False),
        sa.Column('views', sa.Integer(), nullable=False),
        sa.Column('unique_visitors', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('organization_id', 'day'),
    )
    op.create_table(
        'store_visitors',
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('visitor_id', sa.String(length=64), nullable=False),
        sa.Column('seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_day', sa.String(length=10), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('organization_id', 'visitor_id'),
    )
    op.create_index('ix_store_visitors_seen_at', 'store_visitors', ['seen_at'])


def downgrade() -> None:
    op.drop_index('ix_store_visitors_seen_at', table_name='store_visitors')
    op.drop_table('store_visitors')
    op.drop_table('store_visit_days')
