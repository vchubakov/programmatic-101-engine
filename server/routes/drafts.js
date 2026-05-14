import { Router } from 'express';
import { getDb } from '../db/index.js';
import { publishToLinkedIn } from '../services/linkedinPublisher.js';

const router = Router();

function levenshteinDistance(a, b) {
  a = a.slice(0, 500);
  b = b.slice(0, 500);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i || j)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// GET /api/drafts/counts — must be before /:id
router.get('/counts', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT module, COUNT(*) as count FROM drafts WHERE approved = 0 AND rejected = 0 GROUP BY module`)
    .all();
  const counts = { news: 0, education: 0, memes: 0, personal: 0 };
  for (const r of rows) counts[r.module] = Number(r.count);
  res.json({ total: Object.values(counts).reduce((a, b) => a + b, 0), counts });
});

// GET /api/drafts
router.get('/', (req, res) => {
  const db = getDb();
  const { module, platform, approved, rejected } = req.query;
  const conditions = ['1=1'];
  const params = [];
  if (module)               { conditions.push('module = ?');    params.push(module); }
  if (platform)             { conditions.push('platform = ?');  params.push(platform); }
  if (approved !== undefined) { conditions.push('approved = ?'); params.push(Number(approved)); }
  if (rejected !== undefined) { conditions.push('rejected = ?'); params.push(Number(rejected)); }
  const sql = `SELECT * FROM drafts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

// PATCH /api/drafts/:id/approve — save edited content + schedule + feedback, mark approved
router.patch('/:id/approve', (req, res) => {
  const db = getDb();
  const { edited_text, scheduled_at, feedback_rating, feedback_note } = req.body;

  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Not found' });

  let original = '';
  try {
    original = JSON.parse(draft.generated_content || '{}')?.linkedin || '';
  } catch { /* ignore */ }

  const final        = edited_text || original;
  const editDistance = levenshteinDistance(original, final);
  const editRatio    = editDistance / Math.max(original.length, 1);

  const diff = {
    original_length:      original.length,
    final_length:         final.length,
    original_words:       original.split(/\s+/).filter(Boolean).length,
    final_words:          final.split(/\s+/).filter(Boolean).length,
    edit_distance:        editDistance,
    edit_ratio:           parseFloat(editRatio.toFixed(3)),
    substantially_rewritten: editRatio > 0.3,
  };

  const validRatings = ['good', 'needed_work', 'missed_point'];
  const rating = validRatings.includes(feedback_rating) ? feedback_rating : null;

  const result = db.prepare(`
    UPDATE drafts
    SET approved               = 1,
        edited_text            = ?,
        scheduled_at           = ?,
        original_generated_text = ?,
        edit_diff              = ?,
        feedback_rating        = ?,
        feedback_note          = ?
    WHERE id = ?
  `).run(
    edited_text ?? null,
    scheduled_at ?? null,
    original || null,
    JSON.stringify(diff),
    rating,
    feedback_note ?? null,
    req.params.id,
  );

  if (!result.changes) return res.status(404).json({ error: 'Not found' });

  res.json({ ok: true, edit_diff: diff });
});

// PATCH /api/drafts/:id/reject — mark rejected, removes from review queue
router.patch('/:id/reject', (req, res) => {
  const result = getDb()
    .prepare(`UPDATE drafts SET rejected = 1 WHERE id = ?`)
    .run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/drafts/:id/post-now — immediately publish an approved draft
router.post('/:id/post-now', async (req, res) => {
  const db    = getDb();
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ? AND approved = 1').get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found or not approved' });

  let text;
  try {
    const content = JSON.parse(draft.generated_content || '{}');
    text = draft.edited_text || content.linkedin || '';
  } catch {
    text = draft.edited_text || '';
  }

  if (!text) return res.status(400).json({ error: 'No text to post' });

  try {
    const { postId, postUrl } = await publishToLinkedIn(text, db);

    db.prepare(`
      UPDATE drafts
      SET posted_at        = ?,
          linkedin_post_id = ?,
          post_url         = ?,
          posted_platform  = 'linkedin'
      WHERE id = ?
    `).run(new Date().toISOString(), postId || null, postUrl || null, draft.id);

    res.json({ ok: true, postUrl });
  } catch (err) {
    console.error(`[post-now] Draft ${draft.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drafts/:id/regenerate — stub: queues Claude regeneration
router.post('/:id/regenerate', (req, res) => {
  const draft = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, message: 'Regeneration queued (stub — not yet implemented)' });
});

// GET /api/drafts/:id
router.get('/:id', (req, res) => {
  const draft = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Not found' });
  res.json(draft);
});

// POST /api/drafts
router.post('/', (req, res) => {
  const db = getDb();
  const { module, platform, source_data, generated_content } = req.body;
  const result = db
    .prepare(`INSERT INTO drafts (module, platform, source_data, generated_content) VALUES (?,?,?,?)`)
    .run(module, platform, JSON.stringify(source_data ?? null), JSON.stringify(generated_content ?? null));
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/drafts/:id
router.patch('/:id', (req, res) => {
  const db = getDb();
  const allowed = ['approved', 'edited_text', 'scheduled_at', 'posted_at', 'post_url'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  const sql = `UPDATE drafts SET ${updates.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`;
  const params = [...updates.map(([, v]) => v), req.params.id];
  const result = db.prepare(sql).run(...params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/drafts/:id
router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM drafts WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
