export function runMigrations(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS drafts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      module        TEXT NOT NULL CHECK(module IN ('news','education','memes','personal')),
      platform      TEXT NOT NULL CHECK(platform IN ('linkedin','x','both')),
      source_data   TEXT,
      generated_content TEXT,
      approved      INTEGER NOT NULL DEFAULT 0,
      edited_text   TEXT,
      scheduled_at  TEXT,
      posted_at     TEXT,
      post_url      TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS topics (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      category   TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_config (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      module    TEXT NOT NULL,
      platform  TEXT NOT NULL,
      days      TEXT NOT NULL DEFAULT '[]',
      time_cet  TEXT NOT NULL DEFAULT '09:00',
      active    INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // Add rejected column if not present (safe on fresh or existing DBs)
  try {
    db.exec(`ALTER TABLE drafts ADD COLUMN rejected INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }

  // Seed default settings keys if absent
  const seed = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  );
  const defaults = [
    ['anthropic_api_key', ''],
    ['default_platform', 'linkedin'],
    ['timezone', 'Europe/Amsterdam'],
  ];
  for (const [k, v] of defaults) seed.run(k, v);
}
