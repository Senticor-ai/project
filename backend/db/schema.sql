CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_memberships (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS default_org_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_default_org_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_default_org_fk
      FOREIGN KEY (default_org_id) REFERENCES organizations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions (refresh_token_hash);

CREATE TABLE IF NOT EXISTS items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  created_by_user_id UUID REFERENCES users(id),
  canonical_id TEXT NOT NULL,
  schema_jsonld JSONB NOT NULL,
  source TEXT NOT NULL,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_org_canonical_id ON items (org_id, canonical_id);
CREATE INDEX IF NOT EXISTS idx_items_org_updated_at ON items (org_id, updated_at);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_items_name
  ON items (org_id, (schema_jsonld->>'name'))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON items USING gin ((schema_jsonld->>'name') gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_jsonld_gin
  ON items USING gin (schema_jsonld jsonb_path_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_endtime
  ON items ((schema_jsonld->>'endTime'))
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS assertions (
  assertion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID REFERENCES items(item_id),
  assertion_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_assertion_id UUID,
  otel_trace_id TEXT
);

ALTER TABLE assertions ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  org_id UUID NOT NULL REFERENCES organizations(id),
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  dead_lettered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  owner_id UUID REFERENCES users(id),
  original_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE files ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE TABLE IF NOT EXISTS search_index_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by_user_id UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_index_jobs_entity
  ON search_index_jobs (org_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS import_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  owner_id UUID REFERENCES users(id),
  file_id UUID REFERENCES files(file_id),
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  options JSONB NOT NULL,
  summary JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org_created_at
  ON import_jobs (org_id, created_at DESC);
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS progress JSONB;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

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
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE TABLE IF NOT EXISTS search_ocr_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ocr_engine TEXT NOT NULL DEFAULT 'auto',
  ocr_langs JSONB NOT NULL DEFAULT '[]'::jsonb,
  force_full_page_ocr BOOLEAN NOT NULL DEFAULT false,
  bitmap_area_threshold REAL NOT NULL DEFAULT 0.05,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS ocr_engine TEXT;
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS ocr_langs JSONB;
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS force_full_page_ocr BOOLEAN;
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS bitmap_area_threshold REAL;
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE search_ocr_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS search_index_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT 'upsert',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by_user_id UUID REFERENCES users(id)
);
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE search_index_jobs ADD COLUMN IF NOT EXISTS requested_by_user_id UUID;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS push_outbox (
  push_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Normalize absolute storage_path values to relative keys (idempotent).
UPDATE files
SET storage_path = regexp_replace(storage_path, '^.*/storage/', '')
WHERE storage_path LIKE '/%';

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_outbox_events_processed ON outbox_events (processed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_dead_lettered ON outbox_events (dead_lettered_at) WHERE dead_lettered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_outbox_processed ON push_outbox (processed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files (owner_id);
CREATE INDEX IF NOT EXISTS idx_files_org ON files (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_index_jobs_entity ON search_index_jobs (org_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_search_index_jobs_status ON search_index_jobs (org_id, status);

-- Email integration tables
CREATE TABLE IF NOT EXISTS email_connections (
  connection_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  email_address   TEXT NOT NULL,
  display_name    TEXT,
  auth_method     TEXT NOT NULL DEFAULT 'oauth2',
  oauth_provider  TEXT DEFAULT 'gmail',
  encrypted_access_token  TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at        TIMESTAMPTZ,
  sync_interval_minutes   INTEGER NOT NULL DEFAULT 15,
  sync_mark_read          BOOLEAN NOT NULL DEFAULT false,
  last_sync_at            TIMESTAMPTZ,
  last_sync_error         TEXT,
  last_sync_message_count INTEGER,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_connections_user_email
  ON email_connections (org_id, user_id, email_address)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS email_sync_state (
  sync_state_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  UUID NOT NULL REFERENCES email_connections(connection_id),
  folder_name    TEXT NOT NULL DEFAULT 'INBOX',
  last_seen_uid  BIGINT NOT NULL DEFAULT 0,
  uidvalidity    BIGINT,
  UNIQUE (connection_id, folder_name)
);

-- Migration: change default sync interval from manual (0) to 15 minutes
ALTER TABLE email_connections ALTER COLUMN sync_interval_minutes SET DEFAULT 15;
UPDATE email_connections SET sync_interval_minutes = 15
  WHERE sync_interval_minutes = 0 AND is_active = true;

-- Migration: Gmail API Watch + Pub/Sub (replace IMAP UID tracking with history ID)
ALTER TABLE email_sync_state ADD COLUMN IF NOT EXISTS last_history_id BIGINT;
ALTER TABLE email_sync_state DROP COLUMN IF EXISTS last_seen_uid;
ALTER TABLE email_sync_state DROP COLUMN IF EXISTS uidvalidity;

ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ;
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS watch_history_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_email_connections_watch_expiration
  ON email_connections (watch_expiration) WHERE is_active = true AND watch_expiration IS NOT NULL;

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  external_id     TEXT NOT NULL,
  agent_backend   TEXT NOT NULL DEFAULT 'haystack',
  title           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

-- Add agent_backend to existing tables (idempotent migration)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_backend TEXT NOT NULL DEFAULT 'haystack';

-- Unique per org + external_id + agent_backend (each backend gets its own conversation)
DROP INDEX IF EXISTS idx_conversations_org_external;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_org_external_backend
  ON conversations (org_id, external_id, agent_backend) WHERE archived_at IS NULL;

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id),
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL DEFAULT '',
  tool_calls      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages (conversation_id, created_at ASC);

-- User agent settings (OpenClaw vs Haystack backend choice)
CREATE TABLE IF NOT EXISTS user_agent_settings (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agent_backend          TEXT NOT NULL DEFAULT 'haystack',
  provider               TEXT NOT NULL DEFAULT 'openrouter',
  api_key_encrypted      BYTEA,
  model                  TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  -- Container lifecycle (Phase 2 — per-user OpenClaw containers)
  container_name         TEXT,
  container_status       TEXT,  -- NULL | 'starting' | 'running' | 'stopped' | 'error'
  container_url          TEXT,
  container_port         INTEGER,
  container_error        TEXT,
  container_started_at   TIMESTAMPTZ,
  last_activity_at       TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 2 columns — safe to re-run on existing tables
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_name TEXT;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_status TEXT;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_url TEXT;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_port INTEGER;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_error TEXT;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS container_started_at TIMESTAMPTZ;
ALTER TABLE user_agent_settings ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uas_port
  ON user_agent_settings (container_port) WHERE container_port IS NOT NULL;

-- Collaboration workspace: workflow, project sharing, action projection/event log
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
