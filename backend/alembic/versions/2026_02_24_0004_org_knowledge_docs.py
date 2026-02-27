"""Org knowledge documents.

Revision ID: 2026_02_24_0004
Revises: 2026_02_24_0003
Create Date: 2026-02-24 00:04:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_24_0004"
down_revision = "2026_02_24_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safety net for environments that may have stamped 2026_02_24_0003
    # from the duplicate org-doc migration rather than disclaimer migration.
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS disclaimer_acknowledged_at TIMESTAMPTZ
        """
    )

    # Add columns first without constraints
    op.execute(
        """
        ALTER TABLE organizations
          ADD COLUMN IF NOT EXISTS general_doc_id UUID,
          ADD COLUMN IF NOT EXISTS user_doc_id UUID,
          ADD COLUMN IF NOT EXISTS log_doc_id UUID,
          ADD COLUMN IF NOT EXISTS agent_doc_id UUID;
        """
    )

    # Add deferred foreign key constraints
    # (DEFERRABLE INITIALLY DEFERRED allows circular dependencies within a transaction)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_general_doc_id'
            ) THEN
                ALTER TABLE organizations
                ADD CONSTRAINT fk_organizations_general_doc_id
                FOREIGN KEY (general_doc_id) REFERENCES items(item_id)
                DEFERRABLE INITIALLY DEFERRED;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_user_doc_id'
            ) THEN
                ALTER TABLE organizations
                ADD CONSTRAINT fk_organizations_user_doc_id
                FOREIGN KEY (user_doc_id) REFERENCES items(item_id)
                DEFERRABLE INITIALLY DEFERRED;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_log_doc_id'
            ) THEN
                ALTER TABLE organizations
                ADD CONSTRAINT fk_organizations_log_doc_id
                FOREIGN KEY (log_doc_id) REFERENCES items(item_id)
                DEFERRABLE INITIALLY DEFERRED;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_agent_doc_id'
            ) THEN
                ALTER TABLE organizations
                ADD CONSTRAINT fk_organizations_agent_doc_id
                FOREIGN KEY (agent_doc_id) REFERENCES items(item_id)
                DEFERRABLE INITIALLY DEFERRED;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
