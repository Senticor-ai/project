"""Add chat_requests table for request lifecycle tracking.

Tracks the status of each chat completion request through its lifecycle
(accepted -> running -> completed|failed|timed_out), enabling timeout
recovery and observability.

Revision ID: 2026_03_04_0009
Revises: 2026_03_03_0008
Create Date: 2026-03-04 12:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "2026_03_04_0009"
down_revision = "2026_03_03_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_requests (
            request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(conversation_id),
            user_id UUID NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'accepted'
                CHECK (status IN ('accepted', 'running', 'completed', 'failed', 'timed_out')),
            error_detail TEXT,
            error_type TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_chat_requests_conversation
            ON chat_requests (conversation_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_requests_user_status
            ON chat_requests (user_id, status)
            WHERE status IN ('accepted', 'running');
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
