-- Bastion – page permissions, trash, comments, data-sheet schemas & expiry dates,
-- snippets and the approval workflow

-- ---------------------------------------------------------------- page-level permissions
-- A page with entries here is "restricted": only the listed people/groups can see it
-- (and its subpages). Grants never exceed the space level; space admins keep full access.
CREATE TABLE page_permissions (
  id             SERIAL PRIMARY KEY,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   INTEGER NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('read','write')),
  UNIQUE (page_id, principal_type, principal_id)
);
CREATE INDEX page_permissions_page_idx ON page_permissions(page_id);

CREATE OR REPLACE FUNCTION page_access(p_page_id INT, p_user_id INT) RETURNS INT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_space INT;
  v_level INT;
  v_grant INT;
BEGIN
  SELECT space_id INTO v_space FROM pages WHERE id = p_page_id;
  IF v_space IS NULL THEN RETURN 0; END IF;
  v_level := space_access(v_space, p_user_id);
  IF v_level = 0 OR v_level >= 3 THEN RETURN v_level; END IF;
  -- fast path: no restrictions anywhere in this space
  IF NOT EXISTS (SELECT 1 FROM page_permissions pp JOIN pages x ON x.id = pp.page_id WHERE x.space_id = v_space) THEN
    RETURN v_level;
  END IF;
  -- every restricted page on the way up must grant access; the weakest grant wins
  WITH RECURSIVE up AS (
    SELECT id, parent_id, 0 AS d FROM pages WHERE id = p_page_id
    UNION ALL
    SELECT p.id, p.parent_id, up.d + 1 FROM pages p JOIN up ON p.id = up.parent_id WHERE up.d < 50
  ), per_page AS (
    SELECT up.id,
           coalesce(max(CASE pp.level WHEN 'read' THEN 1 WHEN 'write' THEN 2 ELSE 0 END) FILTER (
             WHERE (pp.principal_type = 'user' AND pp.principal_id = p_user_id)
                OR (pp.principal_type = 'group' AND pp.principal_id IN (SELECT group_id FROM group_members WHERE user_id = p_user_id))
           ), 0) AS g
      FROM up JOIN page_permissions pp ON pp.page_id = up.id
     GROUP BY up.id
  )
  SELECT min(g) INTO v_grant FROM per_page;
  IF v_grant IS NULL THEN RETURN v_level; END IF;
  RETURN LEAST(v_level, v_grant);
END $$;

-- ---------------------------------------------------------------- trash
CREATE TABLE page_trash (
  id         SERIAL PRIMARY KEY,
  page_id    INTEGER NOT NULL,              -- original id, reused on restore
  space_id   INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  parent_id  INTEGER,
  title      TEXT NOT NULL,
  page_type  TEXT NOT NULL DEFAULT 'doc',
  data       JSONB NOT NULL,                -- page row, revisions, tags, attachments, secrets, runs, children …
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX page_trash_space_idx ON page_trash(space_id, deleted_at DESC);

-- ---------------------------------------------------------------- comments
CREATE TABLE comments (
  id          SERIAL PRIMARY KEY,
  page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  mentions    INTEGER[] NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_page_idx ON comments(page_id, created_at);

-- ---------------------------------------------------------------- data-sheet schemas
CREATE TABLE sheet_schemas (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  page_type   TEXT,                          -- suggested for this page type
  fields      JSONB NOT NULL DEFAULT '[]',   -- [{ id, label, type, required, options[], expiry, leadDays, hint }]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pages ADD COLUMN schema_id INTEGER REFERENCES sheet_schemas(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN schema_id INTEGER REFERENCES sheet_schemas(id) ON DELETE SET NULL;

-- one reminder per page, field and due date
CREATE TABLE expiry_notified (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  field   TEXT NOT NULL,
  due     DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, field, due)
);

-- ---------------------------------------------------------------- snippets
CREATE TABLE snippets (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- approval workflow
ALTER TABLE pages ADD COLUMN approval_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pages ADD COLUMN approver_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL;

CREATE TABLE change_requests (
  id           SERIAL PRIMARY KEY,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  base_version INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  properties   JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags         TEXT[],
  schema_id    INTEGER,
  summary      TEXT NOT NULL DEFAULT '',
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  reviewer_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE INDEX change_requests_page_idx ON change_requests(page_id, status);
CREATE UNIQUE INDEX change_requests_open_uq ON change_requests(page_id) WHERE status = 'pending';
