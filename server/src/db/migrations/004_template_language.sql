-- Built-in templates exist per UI language; user-created templates (language NULL) are shown to everyone.
ALTER TABLE templates ADD COLUMN language TEXT CHECK (language IN ('de', 'en'));
UPDATE templates SET language = 'de' WHERE is_builtin;
