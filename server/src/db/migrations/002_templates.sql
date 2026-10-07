CREATE TABLE templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'file-text',
  page_type   TEXT NOT NULL DEFAULT 'doc',
  content     TEXT NOT NULL DEFAULT '',
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
