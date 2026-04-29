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

  // Seed education topics if table is empty
  const topicCount = db.prepare('SELECT COUNT(*) as n FROM topics').get().n;
  if (topicCount === 0) {
    const insertTopic = db.prepare('INSERT INTO topics (title, category) VALUES (?, ?)');
    const educationTopics = [
      'What incrementality actually measures (and why your last-click data is lying)',
      'Lookback windows — how the wrong setting inflates your conversions',
      'Why CPM optimization hurts performance campaigns',
      'The difference between PMPs and open market in CTV',
      'LAL audiences and why they mostly reach existing customers',
      'FAST channel inventory — what buyers need to know',
      'SPO — what it is and when it actually matters',
      'Why completion rate is a bad CTV metric',
      'How frequency capping works across DSPs (and where it breaks)',
      'Brand safety vs brand suitability — the real difference',
      'Audience-first vs channel-first planning',
      'What iCPA and iROAS actually measure',
      'MFA inventory — how to identify and exclude it',
      'The attention metric hype — what\'s real',
      'How bid shading works in first-price auctions',
      'Deal IDs — when to use them vs open market',
      'Why your CTV reach numbers are probably wrong',
      'Attribution window mismatch — the hidden campaign killer',
      'Cross-device tracking in 2025 — what actually works',
      'How Amazon DSP targeting differs from TTD and DV360',
      'Creative fatigue in programmatic — when to refresh',
      'Why your allowlist might be hurting scale without improving quality',
      'The role of creative in programmatic performance',
      'Measurement frameworks for brand campaigns',
      'When to use DSP audiences vs first-party data',
    ];
    for (const title of educationTopics) {
      insertTopic.run(title, 'education');
    }
  }
}
