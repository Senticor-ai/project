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

CREATE TABLE IF NOT EXISTS things (
  thing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

ALTER TABLE things ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE things ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_things_org_canonical_id ON things (org_id, canonical_id);
CREATE INDEX IF NOT EXISTS idx_things_org_updated_at ON things (org_id, updated_at);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_things_name
  ON things (org_id, (schema_jsonld->>'name'))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_things_name_trgm
  ON things USING gin ((schema_jsonld->>'name') gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_things_jsonld_gin
  ON things USING gin (schema_jsonld jsonb_path_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_things_endtime
  ON things ((schema_jsonld->>'endTime'))
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS assertions (
  assertion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  thing_id UUID REFERENCES things(thing_id),
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
