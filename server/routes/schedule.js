import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

// GET /api/schedule/upcoming — drafts with scheduled_at in the future
router.get('/upcoming', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM drafts
       WHERE scheduled_at IS NOT NULL AND posted_at IS NULL
       ORDER BY scheduled_at ASC
       LIMIT 20`
    )
    .all();
  res.json(rows);
});

// GET /api/schedule/config
router.get('/config', (_req, res) => {
  res.json(getDb().prepare('SELECT * FROM schedule_config').all());
});

// POST /api/schedule/config
router.post('/config', (req, res) => {
  const { module, platform, days, time_cet } = req.body;
  if (!module || !platform) return res.status(400).json({ error: 'module and platform required' });
  const result = getDb()
    .prepare(`INSERT INTO schedule_config (module, platform, days, time_cet) VALUES (?,?,?,?)`)
    .run(module, platform, JSON.stringify(days ?? []), time_cet ?? '09:00');
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/schedule/config/:id
router.patch('/config/:id', (req, res) => {
  const db = getDb();
  const allowed = ['days', 'time_cet', 'active'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  const values = updates.map(([k, v]) => (k === 'days' && Array.isArray(v) ? JSON.stringify(v) : v));
  const sql = `UPDATE schedule_config SET ${updates.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`;
  const result = db.prepare(sql).run(...values, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
