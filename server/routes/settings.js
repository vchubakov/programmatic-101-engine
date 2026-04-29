import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  // Mask API key value in response
  const masked = rows.map((r) =>
    r.key === 'anthropic_api_key' && r.value
      ? { ...r, value: r.value.slice(0, 8) + '••••••••' }
      : r
  );
  res.json(masked);
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(req.params.key, value);
  res.json({ ok: true });
});

export default router;
