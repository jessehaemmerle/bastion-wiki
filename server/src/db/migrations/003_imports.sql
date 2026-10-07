CREATE TABLE import_jobs (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN ('analyzing','ready','running','done','failed','discarded')),
  progress    INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  preview     JSONB NOT NULL DEFAULT '{}'::jsonb,
  options     JSONB NOT NULL DEFAULT '{}'::jsonb,
  result      JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings    JSONB NOT NULL DEFAULT '[]'::jsonb,
  error       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX import_jobs_created_idx ON import_jobs(created_at DESC);
