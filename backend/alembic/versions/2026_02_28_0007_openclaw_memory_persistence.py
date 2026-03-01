"""Add OpenClaw memory persistence tables.

Revision ID: 2026_02_28_0007
Revises: 2026_02_25_0006
Create Date: 2026-02-28 22:25:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_28_0007"
down_revision = "2026_02_25_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS openclaw_memory_versions (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          filename       TEXT NOT NULL,
          version        INTEGER NOT NULL,
          content        TEXT NOT NULL,
          content_sha256 TEXT NOT NULL,
          source         TEXT NOT NULL,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (source IN ('bootstrap', 'runtime-sync', 'manual-restore'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_openclaw_memory_versions_unique
          ON openclaw_memory_versions (user_id, filename, version);
        CREATE INDEX IF NOT EXISTS idx_openclaw_memory_versions_user_file_created
          ON openclaw_memory_versions (user_id, filename, created_at DESC);

        CREATE TABLE IF NOT EXISTS openclaw_memory_heads (
          user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename        TEXT NOT NULL,
          current_version INTEGER NOT NULL,
          current_sha256  TEXT NOT NULL,
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, filename)
        );
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
