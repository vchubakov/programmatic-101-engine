import express from 'express';
import multer from 'multer';
import { getDb } from '../db/index.js';
import { parseLinkedInExport } from '../services/linkedinAnalyticsParser.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function extractPostId(url) {
  const match = url.match(/\/posts\/([^/?]+)/);
  return match ? match[1] : null;
}

// POST /api/analytics/import
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let parsed;
  try {
    parsed = parseLinkedInExport(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }

  const db = getDb();

  const upsertPost = db.prepare(`
    INSERT INTO linkedin_post_stats (post_url, publish_date, impressions, engagements, engagement_rate)
    VALUES (@url, @publish_date, @impressions, @engagements, @engagement_rate)
    ON CONFLICT(post_url) DO UPDATE SET
      impressions      = excluded.impressions,
      engagements      = excluded.engagements,
      engagement_rate  = excluded.engagement_rate,
      imported_at      = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `);

  const upsertDaily = db.prepare(`
    INSERT INTO linkedin_daily_stats (date, impressions, engagements, engagement_rate)
    VALUES (@date, @impressions, @engagements, @engagement_rate)
    ON CONFLICT(date) DO UPDATE SET
      impressions     = excluded.impressions,
      engagements     = excluded.engagements,
      engagement_rate = excluded.engagement_rate
  `);

  const updateDraftUrl = db.prepare(`
    UPDATE drafts SET linkedin_post_url = ?
    WHERE id = ? AND (linkedin_post_url IS NULL OR linkedin_post_url = '')
  `);

  const importMany = db.transaction(() => {
    for (const post of parsed.posts) {
      const engRate = (post.engagements || 0) / Math.max(post.impressions || 0, 1);
      upsertPost.run({
        url: post.url,
        publish_date: post.publish_date || null,
        impressions: post.impressions || 0,
        engagements: post.engagements || 0,
        engagement_rate: engRate,
      });

      // Try to match to a draft by post ID in URL
      const postId = extractPostId(post.url);
      if (postId) {
        const matched = db.prepare(`
          SELECT id FROM drafts
          WHERE post_url LIKE ? OR linkedin_post_url LIKE ?
          LIMIT 1
        `).get(`%${postId}%`, `%${postId}%`);
        if (matched) updateDraftUrl.run(post.url, matched.id);
      }
    }

    for (const day of parsed.dailyEngagement) {
      const engRate = day.engagements / Math.max(day.impressions, 1);
      upsertDaily.run({
        date: day.date,
        impressions: day.impressions,
        engagements: day.engagements,
        engagement_rate: engRate,
      });
    }

    const dates = parsed.dailyEngagement.map(d => d.date).sort();
    const dateRange = dates.length
      ? `${dates[0]} to ${dates[dates.length - 1]}`
      : 'unknown';

    db.prepare(`
      INSERT INTO linkedin_analytics_imports
        (date_range, total_impressions, members_reached, total_followers, posts_imported)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      dateRange,
      parsed.totals.totalImpressions,
      parsed.totals.membersReached,
      parsed.totals.totalFollowers,
      parsed.posts.length,
    );

    return { dateRange, postsImported: parsed.posts.length };
  });

  try {
    const { dateRange, postsImported } = importMany();
    res.json({
      posts_imported: postsImported,
      date_range: dateRange,
      totals: parsed.totals,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/summary
router.get('/summary', (req, res) => {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as n FROM linkedin_post_stats').get().n;
  const avgRow = db.prepare('SELECT AVG(engagement_rate) as avg FROM linkedin_post_stats').get();
  const best = db.prepare(
    'SELECT * FROM linkedin_post_stats ORDER BY engagement_rate DESC LIMIT 1'
  ).get();
  const worst = db.prepare(
    'SELECT * FROM linkedin_post_stats WHERE impressions > 0 ORDER BY engagement_rate ASC LIMIT 1'
  ).get();

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recent = db.prepare(`
    SELECT COALESCE(SUM(impressions),0) as impressions, COALESCE(SUM(engagements),0) as engagements
    FROM linkedin_daily_stats WHERE date >= ?
  `).get(cutoff);

  const follRow = db.prepare(`
    SELECT total_followers, imported_at FROM linkedin_analytics_imports
    ORDER BY imported_at DESC LIMIT 1
  `).get();

  const lastImport = db.prepare(
    'SELECT imported_at FROM linkedin_analytics_imports ORDER BY imported_at DESC LIMIT 1'
  ).get();

  res.json({
    total_posts_tracked: total,
    avg_engagement_rate: avgRow?.avg || 0,
    best_post: best || null,
    worst_post: worst || null,
    recent_30_days: recent || { impressions: 0, engagements: 0 },
    total_followers: follRow?.total_followers || 0,
    last_import: lastImport?.imported_at || null,
  });
});

// GET /api/analytics/posts
router.get('/posts', (req, res) => {
  const db = getDb();
  const posts = db.prepare(`
    SELECT lps.*,
           d.id as draft_id,
           d.generated_content,
           d.edited_text,
           d.agent_scope
    FROM linkedin_post_stats lps
    LEFT JOIN drafts d ON d.linkedin_post_url = lps.post_url
    ORDER BY lps.engagement_rate DESC
  `).all();
  res.json(posts);
});

// GET /api/analytics/daily
router.get('/daily', (req, res) => {
  const db = getDb();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT * FROM linkedin_daily_stats WHERE date >= ? ORDER BY date ASC
  `).all(cutoff);
  res.json(rows);
});

export default router;
