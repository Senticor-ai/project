"""Collaboration workspace tables.

Revision ID: 2026_02_23_0002
Revises: 2026_02_13_0001
Create Date: 2026-02-23 00:02:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_02_23_0002"
down_revision = "2026_02_13_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_workflow (
          project_item_id   UUID PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
          policy_mode       TEXT NOT NULL DEFAULT 'open',
          default_status    TEXT NOT NULL DEFAULT 'PotentialActionStatus',
          done_statuses     JSONB NOT NULL DEFAULT '["CompletedActionStatus"]'::jsonb,
          blocked_statuses  JSONB NOT NULL DEFAULT '["FailedActionStatus"]'::jsonb,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS workflow_state (
          project_item_id   UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
          canonical_status  TEXT NOT NULL,
          column_label      TEXT NOT NULL,
          position          INTEGER NOT NULL DEFAULT 0,
          is_default        BOOLEAN NOT NULL DEFAULT false,
          is_done           BOOLEAN NOT NULL DEFAULT false,
          is_blocked        BOOLEAN NOT NULL DEFAULT false,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (project_item_id, canonical_status)
        );

        CREATE TABLE IF NOT EXISTS workflow_transition (
          project_item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
          from_status     TEXT NOT NULL,
          to_status       TEXT NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (project_item_id, from_status, to_status)
        );

        CREATE TABLE IF NOT EXISTS project_member (
          project_item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
          user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role            TEXT NOT NULL DEFAULT 'member',
          added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          added_by        UUID REFERENCES users(id),
          PRIMARY KEY (project_item_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_member_user
          ON project_member (user_id, project_item_id);

        CREATE TABLE IF NOT EXISTS project_action (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          project_item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
          canonical_id    TEXT NOT NULL,
          name            TEXT NOT NULL,
          description     TEXT,
          action_status   TEXT NOT NULL DEFAULT 'PotentialActionStatus',
          owner_user_id   UUID REFERENCES users(id),
          owner_text      TEXT,
          due_at          TIMESTAMPTZ,
          tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
          object_ref      JSONB,
          attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by      UUID REFERENCES users(id),
          archived_at     TIMESTAMPTZ
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_project_action_org_canonical
          ON project_action (org_id, canonical_id);
        CREATE INDEX IF NOT EXISTS idx_project_action_project_status
          ON project_action (project_item_id, action_status)
          WHERE archived_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_project_action_due_at
          ON project_action (project_item_id, due_at)
          WHERE archived_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_project_action_tags_gin
          ON project_action USING gin (tags)
          WHERE archived_at IS NULL;

        CREATE TABLE IF NOT EXISTS action_transition_event (
          id              BIGSERIAL PRIMARY KEY,
          ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
          action_id       UUID NOT NULL REFERENCES project_action(id) ON DELETE CASCADE,
          actor_id        UUID NOT NULL REFERENCES users(id),
          from_status     TEXT,
          to_status       TEXT NOT NULL,
          reason          TEXT,
          payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
          correlation_id  TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_action_transition_event_action
          ON action_transition_event (action_id, id);

        CREATE TABLE IF NOT EXISTS action_state_projection (
          action_id      UUID PRIMARY KEY REFERENCES project_action(id) ON DELETE CASCADE,
          status         TEXT NOT NULL,
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_event_id  BIGINT REFERENCES action_transition_event(id)
        );

        CREATE INDEX IF NOT EXISTS idx_action_state_projection_status
          ON action_state_projection (status, updated_at);

        CREATE TABLE IF NOT EXISTS action_comment (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          action_id          UUID NOT NULL REFERENCES project_action(id) ON DELETE CASCADE,
          author_id          UUID NOT NULL REFERENCES users(id),
          parent_comment_id  UUID REFERENCES action_comment(id) ON DELETE CASCADE,
          body               TEXT NOT NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_action_comment_action_created
          ON action_comment (action_id, created_at);

        CREATE TABLE IF NOT EXISTS action_revision (
          id          BIGSERIAL PRIMARY KEY,
          action_id   UUID NOT NULL REFERENCES project_action(id) ON DELETE CASCADE,
          actor_id    UUID NOT NULL REFERENCES users(id),
          diff        JSONB NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_action_revision_action_created
          ON action_revision (action_id, created_at);
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
