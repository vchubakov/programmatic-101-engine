import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { LearningAgent } from '../agents/learningAgent.js';

const router = Router();

// POST /api/agents/learn — run the learning agent across all scopes
router.post('/learn', async (req, res) => {
  const db = getDb();
  const apiKeySetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key');
  const apiKey = apiKeySetting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });
  const learner = new LearningAgent();

  try {
    const results = await learner.run(db, client);
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Learning agent error:', err);
    res.status(500).json({ error: 'Learning agent failed', detail: err.message });
  }
});

// GET /api/agents/learnings — all rows from learnings table
router.get('/learnings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM learnings ORDER BY scope').all();
  res.json(rows);
});

// PATCH /api/agents/learnings/:scope/approve — approve the pending patch
router.patch('/learnings/:scope/approve', (req, res) => {
  const { scope } = req.params;
  const db = getDb();

  const learning = db.prepare('SELECT * FROM learnings WHERE scope = ?').get(scope);
  if (!learning) return res.status(404).json({ error: 'Scope not found' });

  db.prepare(`
    UPDATE learnings SET patch_approved = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE scope = ?
  `).run(scope);

  // Activate the matching prompt version
  if (learning.version > 0) {
    db.prepare(`
      UPDATE prompt_versions SET active = 0 WHERE scope = ?
    `).run(scope);
    db.prepare(`
      UPDATE prompt_versions SET active = 1 WHERE scope = ? AND version = ?
    `).run(scope, learning.version);
  }

  const updated = db.prepare('SELECT * FROM learnings WHERE scope = ?').get(scope);
  res.json(updated);
});

// PATCH /api/agents/learnings/:scope/reject — reject the pending patch
router.patch('/learnings/:scope/reject', (req, res) => {
  const { scope } = req.params;
  const db = getDb();

  if (!db.prepare('SELECT id FROM learnings WHERE scope = ?').get(scope)) {
    return res.status(404).json({ error: 'Scope not found' });
  }

  db.prepare(`
    UPDATE learnings
    SET prompt_patch = '', patch_approved = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE scope = ?
  `).run(scope);

  const updated = db.prepare('SELECT * FROM learnings WHERE scope = ?').get(scope);
  res.json(updated);
});

// GET /api/agents/logs/:draftId — agent log for a specific draft
router.get('/logs/:draftId', (req, res) => {
  const db = getDb();
  const logs = db.prepare(
    'SELECT * FROM agent_logs WHERE draft_id = ? ORDER BY created_at DESC'
  ).all(Number(req.params.draftId));
  res.json(logs);
});

export default router;
