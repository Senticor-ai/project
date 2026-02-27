"""Google Workspace calendar sync + proposal audit tables.

Revision ID: 2026_02_25_0004
Revises: 2026_02_24_0004
Create Date: 2026-02-25 00:04:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_25_0004"
down_revision = "2026_02_24_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE email_connections
          ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS calendar_sync_token TEXT,
          ADD COLUMN IF NOT EXISTS calendar_sync_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS calendar_selected_ids JSONB NOT NULL
            DEFAULT '["primary"]'::jsonb,
          ADD COLUMN IF NOT EXISTS last_calendar_sync_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS last_calendar_sync_error TEXT,
          ADD COLUMN IF NOT EXISTS last_calendar_sync_event_count INTEGER;

        UPDATE email_connections
        SET calendar_sync_tokens = '{}'::jsonb
        WHERE calendar_sync_tokens IS NULL;

        UPDATE email_connections
        SET calendar_selected_ids = '["primary"]'::jsonb
        WHERE calendar_selected_ids IS NULL
           OR jsonb_typeof(calendar_selected_ids) <> 'array';

        UPDATE email_connections
        SET calendar_selected_ids = '["primary"]'::jsonb
        WHERE jsonb_typeof(calendar_selected_ids) = 'array'
          AND jsonb_array_length(calendar_selected_ids) = 0;

        CREATE INDEX IF NOT EXISTS idx_email_connections_calendar_sync
          ON email_connections (last_calendar_sync_at)
          WHERE is_active = true AND calendar_sync_enabled = true;

        CREATE TABLE IF NOT EXISTS connector_action_proposals (
          proposal_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id           UUID NOT NULL REFERENCES organizations(id),
          user_id          UUID NOT NULL REFERENCES users(id),
          connection_id    UUID NOT NULL REFERENCES email_connections(connection_id),
          proposal_type    TEXT NOT NULL,
          status           TEXT NOT NULL DEFAULT 'pending',
          source_item_id   UUID REFERENCES items(item_id),
          payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          decided_at       TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_connector_action_proposals_user_status
          ON connector_action_proposals (org_id, user_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_connector_action_proposals_source
          ON connector_action_proposals (source_item_id);

        CREATE TABLE IF NOT EXISTS connector_action_audit_log (
          audit_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id           UUID NOT NULL REFERENCES organizations(id),
          user_id          UUID NOT NULL REFERENCES users(id),
          connection_id    UUID REFERENCES email_connections(connection_id),
          proposal_id      UUID REFERENCES connector_action_proposals(proposal_id),
          event_type       TEXT NOT NULL,
          payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_connector_action_audit_org_time
          ON connector_action_audit_log (org_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_connector_action_audit_proposal
          ON connector_action_audit_log (proposal_id, created_at DESC);
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
