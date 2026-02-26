"""Add encryption_key_version column for key rotation tracking.

Revision ID: 2026_02_25_0005
Revises: 2026_02_25_0004
Create Date: 2026-02-25 16:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_25_0005"
down_revision = "2026_02_25_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE email_connections
          ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER;
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
