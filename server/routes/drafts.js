import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

// GET /api/drafts/counts — must be before /:id
router.get('/counts', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT module, COUNT(*) as count FROM drafts WHERE approved = 0 GROUP BY module`)
    .all();
  const counts = { news: 0, education: 0, memes: 0, personal: 0 };
  for (const r of rows) counts[r.module] = Number(r.count);
  res.json({ total: Object.values(counts).reduce((a, b) => a + b, 0), counts });
});

// GET /api/drafts
router.get('/', (req, res) => {
  const db = getDb();
  const { module, platform, approved } = req.query;
  const conditions = ['1=1'];
  const params = [];
  if (module)              { conditions.push('module = ?');   params.push(module); }
  if (platform)            { conditions.push('platform = ?'); params.push(platform); }
  if (approved !== undefined) { conditions.push('approved = ?'); params.push(Number(approved)); }
  const sql = `SELECT * FROM drafts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  res.json(db.prepare(sql).all(...params));
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
