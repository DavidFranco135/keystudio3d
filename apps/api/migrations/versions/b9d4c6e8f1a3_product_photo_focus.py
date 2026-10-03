"""product photo_focus

Revision ID: b9d4c6e8f1a3
Revises: 2e31188d821f
Create Date: 2026-10-02 20:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b9d4c6e8f1a3"
down_revision: str | None = "2e31188d821f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("photo_focus", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.alter_column("products", "photo_focus", server_default=None)


def downgrade() -> None:
    op.drop_column("products", "photo_focus")
