-- Bastion Wiki – initial schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable wrapper so unaccent can be used in generated columns / indexes
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor','viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  preferences   JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,            -- sha256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE api_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- groups
CREATE TABLE groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- ---------------------------------------------------------------- spaces
CREATE TABLE spaces (
  id             SERIAL PRIMARY KEY,
  key            TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  icon           TEXT NOT NULL DEFAULT 'folder',
  color          TEXT NOT NULL DEFAULT '#6366f1',
  -- access every authenticated user gets without an explicit grant
  default_access TEXT NOT NULL DEFAULT 'read' CHECK (default_access IN ('none','read','write')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE space_permissions (
  id             SERIAL PRIMARY KEY,
  space_id       INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   INTEGER NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('read','write','admin')),
  UNIQUE (space_id, principal_type, principal_id)
);

-- ---------------------------------------------------------------- pages
CREATE TABLE pages (
  id           SERIAL PRIMARY KEY,
  space_id     INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  icon         TEXT,
  content      TEXT NOT NULL DEFAULT '',     -- sanitized HTML
  content_text TEXT NOT NULL DEFAULT '',     -- plain text for search
  page_type    TEXT NOT NULL DEFAULT 'doc',  -- doc, runbook, incident, host, change, ...
  properties   JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  version      INTEGER NOT NULL DEFAULT 1,
  review_due   DATE,
  is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(title,''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(properties::text,''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(content_text,''))), 'C')
  ) STORED,
  UNIQUE (space_id, slug)
);
CREATE INDEX pages_space_idx   ON pages(space_id);
CREATE INDEX pages_parent_idx  ON pages(parent_id);
CREATE INDEX pages_search_idx  ON pages USING GIN (search_vector);
CREATE INDEX pages_title_trgm  ON pages USING GIN (title gin_trgm_ops);
CREATE INDEX pages_updated_idx ON pages(updated_at DESC);

CREATE TABLE page_revisions (
  id         SERIAL PRIMARY KEY,
  page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary    TEXT NOT NULL DEFAULT '',
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);

CREATE TABLE favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);

-- ---------------------------------------------------------------- tags
CREATE TABLE tags (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#64748b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tags_name_trgm ON tags USING GIN (name gin_trgm_ops);

CREATE TABLE page_tags (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, tag_id)
);
CREATE INDEX page_tags_tag_idx ON page_tags(tag_id);

-- ---------------------------------------------------------------- attachments
CREATE TABLE attachments (
  id            SERIAL PRIMARY KEY,
  page_id       INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_page_idx ON attachments(page_id);

-- ---------------------------------------------------------------- settings & audit
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_log(created_at DESC);

-- ---------------------------------------------------------------- permissions
-- Effective access level of a user to a space:
--   0 = none, 1 = read, 2 = write, 3 = admin
-- Admins always get 3; viewers are capped at read.
CREATE OR REPLACE FUNCTION space_access(p_space_id INT, p_user_id INT) RETURNS INT
LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT role FROM users WHERE id = p_user_id AND is_active),
  lvl AS (
    SELECT CASE s.default_access WHEN 'read' THEN 1 WHEN 'write' THEN 2 ELSE 0 END AS l
      FROM spaces s WHERE s.id = p_space_id
    UNION ALL
    SELECT CASE sp.level WHEN 'read' THEN 1 WHEN 'write' THEN 2 WHEN 'admin' THEN 3 ELSE 0 END
      FROM space_permissions sp
     WHERE sp.space_id = p_space_id
       AND ((sp.principal_type = 'user'  AND sp.principal_id = p_user_id)
         OR (sp.principal_type = 'group' AND sp.principal_id IN
               (SELECT group_id FROM group_members WHERE user_id = p_user_id)))
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM u) THEN 0
    WHEN (SELECT role FROM u) = 'admin'  THEN 3
    WHEN (SELECT role FROM u) = 'viewer' THEN LEAST(1, COALESCE((SELECT max(l) FROM lvl), 0))
    ELSE COALESCE((SELECT max(l) FROM lvl), 0)
  END
$$;
