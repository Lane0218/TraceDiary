CREATE TABLE IF NOT EXISTS diaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'daily',
  filename TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_month_day
ON diaries(month, day, year DESC);

CREATE INDEX IF NOT EXISTS idx_year
ON diaries(year);

CREATE INDEX IF NOT EXISTS idx_entry_type
ON diaries(entry_type);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('theme', 'light'),
  ('password_hash', ''),
  ('kdf_salt', ''),
  ('password_set_at', ''),
  ('last_verified_at', ''),
  ('github_token', ''),
  ('github_owner', ''),
  ('github_repo', ''),
  ('last_sync_at', '');
