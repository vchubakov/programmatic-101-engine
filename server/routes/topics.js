import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM topics';
  const params = [];
  if (category) { sql += ' WHERE category = ?'; params.push(category); }
  sql += ' ORDER BY created_at DESC';
  res.json(getDb().prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { title, category } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'title and category required' });
  const result = getDb()
    .prepare('INSERT INTO topics (title, category) VALUES (?, ?)')
    .run(title, category);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id/mark-used', (req, res) => {
  const result = getDb()
    .prepare(`UPDATE topics SET used_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM topics WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
