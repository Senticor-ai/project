"""Org knowledge documents.

Revision ID: 2026_02_24_0003
Revises: 2026_02_23_0002
Create Date: 2026-02-24 00:03:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_24_0003"
down_revision = "2026_02_23_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE organizations
          ADD COLUMN IF NOT EXISTS general_doc_id UUID REFERENCES items(item_id),
          ADD COLUMN IF NOT EXISTS user_doc_id UUID REFERENCES items(item_id),
          ADD COLUMN IF NOT EXISTS log_doc_id UUID REFERENCES items(item_id),
          ADD COLUMN IF NOT EXISTS agent_doc_id UUID REFERENCES items(item_id);
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
