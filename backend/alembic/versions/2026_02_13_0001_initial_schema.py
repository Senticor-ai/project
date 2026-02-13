"""Initial schema baseline.

Revision ID: 2026_02_13_0001
Revises:
Create Date: 2026-02-13 00:00:00
"""

from __future__ import annotations

from pathlib import Path

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_13_0001"
down_revision = None
branch_labels = None
depends_on = None


def _schema_sql() -> str:
    backend_dir = Path(__file__).resolve().parents[2]
    schema_path = backend_dir / "db" / "schema.sql"
    return schema_path.read_text(encoding="utf-8")


def upgrade() -> None:
    # Keep the existing idempotent bootstrap behavior while switching to Alembic.
    op.execute(_schema_sql())


def downgrade() -> None:
    raise NotImplementedError("Initial baseline migration does not support downgrade.")
