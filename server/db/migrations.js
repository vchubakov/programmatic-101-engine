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
  } catch { /* already exists */ }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS news_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        articles TEXT NOT NULL,
        scraped_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `);
  } catch { /* already exists */ }

  // Agent columns on drafts
  try { db.exec(`ALTER TABLE drafts ADD COLUMN agent_scope TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE drafts ADD COLUMN prompt_version INTEGER DEFAULT 0`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE drafts ADD COLUMN learning_applied INTEGER DEFAULT 0`); } catch { /* exists */ }

  // Performance tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_performance (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id         INTEGER REFERENCES drafts(id),
      platform         TEXT,
      post_url         TEXT,
      posted_at        TEXT,
      likes            INTEGER DEFAULT 0,
      comments         INTEGER DEFAULT 0,
      shares           INTEGER DEFAULT 0,
      impressions      INTEGER DEFAULT 0,
      clicks           INTEGER DEFAULT 0,
      engagement_rate  REAL DEFAULT 0,
      fetched_at       TEXT,
      raw_api_response TEXT,
      created_at       TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS learnings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      scope          TEXT UNIQUE NOT NULL,
      running_notes  TEXT DEFAULT '',
      prompt_patch   TEXT DEFAULT '',
      patch_approved INTEGER DEFAULT 0,
      version        INTEGER DEFAULT 0,
      updated_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      scope                 TEXT NOT NULL,
      version               INTEGER NOT NULL,
      prompt_text           TEXT NOT NULL,
      avg_engagement_before REAL,
      avg_engagement_after  REAL,
      active                INTEGER DEFAULT 0,
      created_at            TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id               INTEGER REFERENCES drafts(id),
      scope                  TEXT,
      steps                  TEXT DEFAULT '[]',
      prompt_version         INTEGER DEFAULT 0,
      performance_posts_used INTEGER DEFAULT 0,
      learning_applied       INTEGER DEFAULT 0,
      created_at             TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Seed default learnings scopes if absent
  const seedLearning = db.prepare(`INSERT OR IGNORE INTO learnings (scope) VALUES (?)`);
  for (const scope of ['global', 'linkedin_news', 'linkedin_education', 'linkedin_personal', 'x_news', 'x_general']) {
    seedLearning.run(scope);
  }

  // Seed default settings keys if absent (empty placeholders)
  const seed = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  const defaults = [
    ['anthropic_api_key',       ''],
    ['linkedin_client_id',      ''],
    ['linkedin_client_secret',  ''],
    ['brave_api_key',           ''],
    ['default_platform',        'linkedin'],
    ['timezone',                'Europe/Amsterdam'],
  ];
  for (const [k, v] of defaults) seed.run(k, v);

  // Overwrite with env var values when present (lets Railway env vars take precedence)
  const upsert = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  const envKeys = [
    ['anthropic_api_key',      process.env.ANTHROPIC_API_KEY      || ''],
    ['linkedin_client_id',     process.env.LINKEDIN_CLIENT_ID     || ''],
    ['linkedin_client_secret', process.env.LINKEDIN_CLIENT_SECRET || ''],
    ['brave_api_key',          process.env.BRAVE_API_KEY          || ''],
  ];
  for (const [k, v] of envKeys) {
    if (v) upsert.run(k, v);
  }

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
