"""order due_date and production_status

Revision ID: c4e7a1d9b2f6
Revises: b9d4c6e8f1a3
Create Date: 2026-10-03 00:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4e7a1d9b2f6"
down_revision: str | None = "b9d4c6e8f1a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("production_status", sa.String(20), nullable=False, server_default="todo"),
    )
    op.add_column("orders", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "due_date")
    op.drop_column("orders", "production_status")
