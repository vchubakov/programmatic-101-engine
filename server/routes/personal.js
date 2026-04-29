import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { PERSONAL_LINKEDIN_PROMPT } from '../prompts/personal.js';

const router = Router();

router.post('/generate', async (req, res) => {
  const { a1, a2, a3, a4, a5 } = req.body;

  if (!a1?.trim() || !a2?.trim() || !a3?.trim() || !a4?.trim() || !a5?.trim()) {
    return res.status(400).json({ error: 'All five answers are required' });
  }

  const db = getDb();

  const apiKeySetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key');
  const apiKey = apiKeySetting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });

  let postText;
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: PERSONAL_LINKEDIN_PROMPT({ a1, a2, a3, a4, a5 }) }],
    });
    postText = message.content[0]?.text ?? '';
  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(502).json({ error: 'Claude API request failed', detail: err.message });
  }

  const source = JSON.stringify({ a1, a2, a3, a4, a5 });
  const content = JSON.stringify({ linkedin: postText });

  const insert = db.prepare(
    'INSERT INTO drafts (module, platform, source_data, generated_content) VALUES (?, ?, ?, ?)'
  );
  const result = insert.run('personal', 'linkedin', source, content);
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json(draft);
});

export default router;
