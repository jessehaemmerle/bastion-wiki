-- Bastion – operations features: SSO, 2FA, secrets, runbook runs, links,
-- notifications, webhooks, share links, page views

-- ---------------------------------------------------------------- accounts
ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'local' CHECK (auth_source IN ('local','ldap','oidc'));
ALTER TABLE users ADD COLUMN external_id TEXT;
ALTER TABLE users ADD COLUMN totp_secret TEXT;              -- encrypted (lib/crypto.js)
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_recovery JSONB NOT NULL DEFAULT '[]'::jsonb; -- sha256 hashes
CREATE UNIQUE INDEX users_external_idx ON users(auth_source, external_id) WHERE external_id IS NOT NULL;

-- groups can mirror an LDAP group (DN or CN) or an OIDC group claim value
ALTER TABLE groups ADD COLUMN external_name TEXT;

-- ---------------------------------------------------------------- secrets
CREATE TABLE page_secrets (
  id          TEXT PRIMARY KEY,                -- random, referenced from page HTML (data-secret-id)
  space_id    INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  page_id     INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  ciphertext  TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX page_secrets_page_idx ON page_secrets(page_id);

-- ---------------------------------------------------------------- runbook runs
CREATE TABLE runbook_runs (
  id           SERIAL PRIMARY KEY,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_version INTEGER NOT NULL,
  title        TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','aborted')),
  steps        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ text, section, done, doneAt, doneBy, note }]
  log          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ at, by, text }]
  summary      TEXT NOT NULL DEFAULT '',
  started_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX runbook_runs_page_idx ON runbook_runs(page_id, started_at DESC);

-- ---------------------------------------------------------------- links between pages
CREATE TABLE page_links (
  source_id  INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('page','attachment','external')),
  target_id  INTEGER,            -- page or attachment id (no FK: broken links are the point)
  href       TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX page_links_source_idx ON page_links(source_id);
CREATE INDEX page_links_target_idx ON page_links(kind, target_id);

CREATE TABLE link_checks (
  href        TEXT PRIMARY KEY,
  status      INTEGER,            -- HTTP status, 0 = unreachable
  error       TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- notifications
CREATE TABLE watches (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id    INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  space_id   INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((page_id IS NULL) <> (space_id IS NULL))
);
CREATE UNIQUE INDEX watches_page_uq  ON watches(user_id, page_id)  WHERE page_id IS NOT NULL;
CREATE UNIQUE INDEX watches_space_uq ON watches(user_id, space_id) WHERE space_id IS NOT NULL;

CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                  -- page.create, page.update, page.delete, review.due, run.finish
  page_id    INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_mail_idx ON notifications(emailed_at) WHERE emailed_at IS NULL;

CREATE TABLE webhooks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'generic' CHECK (kind IN ('generic','slack','teams','matrix','discord')),
  url         TEXT NOT NULL,                 -- encrypted, may contain tokens
  events      TEXT[] NOT NULL DEFAULT '{page.create,page.update,page.delete,review.due}',
  space_ids   INTEGER[] NOT NULL DEFAULT '{}', -- empty = all spaces
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_status TEXT,
  last_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pages ADD COLUMN review_notified DATE;

-- ---------------------------------------------------------------- share links
CREATE TABLE share_links (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  note         TEXT NOT NULL DEFAULT '',
  expires_at   TIMESTAMPTZ NOT NULL,
  views        INTEGER NOT NULL DEFAULT 0,
  last_view_at TIMESTAMPTZ,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_links_page_idx ON share_links(page_id);

-- ---------------------------------------------------------------- recently viewed
CREATE TABLE page_views (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id   INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);
CREATE INDEX page_views_recent_idx ON page_views(user_id, viewed_at DESC);
