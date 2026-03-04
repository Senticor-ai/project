"""Ensure file_uploads table exists.

The file_uploads table is defined in schema.sql and was part of the initial
schema migration (0001), but some production databases may be missing it if
the initial migration was stamped rather than executed.  This idempotent
migration guarantees the table exists.

Revision ID: 2026_03_03_0008
Revises: 2026_02_28_0007
Create Date: 2026-03-03 12:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_03_03_0008"
down_revision = "2026_02_28_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS file_uploads (
          upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizations(id),
          owner_id UUID REFERENCES users(id),
          filename TEXT NOT NULL,
          content_type TEXT,
          total_size BIGINT NOT NULL,
          chunk_size INTEGER NOT NULL,
          chunk_total INTEGER NOT NULL,
          file_id UUID REFERENCES files(file_id),
          status TEXT NOT NULL DEFAULT 'initiated',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
