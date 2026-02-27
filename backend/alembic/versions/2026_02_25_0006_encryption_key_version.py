"""Add encryption_key_version column for key rotation tracking.

Revision ID: 2026_02_25_0006
Revises: 2026_02_25_0005
Create Date: 2026-02-25 16:06:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_25_0006"
down_revision = "2026_02_25_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS proposal_candidates (
          candidate_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id            UUID NOT NULL REFERENCES organizations(id),
          user_id           UUID NOT NULL REFERENCES users(id),
          connection_id     UUID NOT NULL REFERENCES email_connections(connection_id),
          source_item_id    UUID REFERENCES items(item_id),
          trigger_kind      TEXT NOT NULL DEFAULT 'email_new',
          payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
          status            TEXT NOT NULL DEFAULT 'pending',
          attempts          INTEGER NOT NULL DEFAULT 0,
          lease_expires_at  TIMESTAMPTZ,
          processed_at      TIMESTAMPTZ,
          dead_lettered_at  TIMESTAMPTZ,
          last_error        TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (status IN ('pending', 'processing', 'completed', 'dead_letter'))
        );

        CREATE INDEX IF NOT EXISTS idx_proposal_candidates_pending
          ON proposal_candidates (org_id, user_id, status, created_at)
          WHERE status IN ('pending', 'processing');
        CREATE INDEX IF NOT EXISTS idx_proposal_candidates_source
          ON proposal_candidates (source_item_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_candidates_unique_pending
          ON proposal_candidates (
            org_id,
            user_id,
            connection_id,
            COALESCE(source_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
            trigger_kind
          )
          WHERE status IN ('pending', 'processing');

        CREATE TABLE IF NOT EXISTS notification_events (
          event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id         UUID NOT NULL REFERENCES organizations(id),
          user_id        UUID NOT NULL REFERENCES users(id),
          kind           TEXT NOT NULL,
          title          TEXT NOT NULL,
          body           TEXT NOT NULL,
          url            TEXT,
          payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          read_at        TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_notification_events_user_time
          ON notification_events (org_id, user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notification_events_unread
          ON notification_events (org_id, user_id, read_at)
          WHERE read_at IS NULL;

        ALTER TABLE email_connections
          ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER;
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
