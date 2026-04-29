import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { MOCK_ARTICLES } from '../mock/news.js';
import { NEWS_LINKEDIN_PROMPT, NEWS_X_PROMPT } from '../prompts/news.js';

const router = Router();

// GET /api/news/fetch — returns mock articles
router.get('/fetch', (_req, res) => {
  res.json(MOCK_ARTICLES);
});

// POST /api/news/generate — generate LinkedIn + X drafts for one article
router.post('/generate', async (req, res) => {
  const { article } = req.body;
  if (!article?.headline) {
    return res.status(400).json({ error: 'Provide article object with headline' });
  }

  const db = getDb();
  const apiKeySetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key');
  const apiKey = apiKeySetting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });

  let linkedinText;
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: NEWS_LINKEDIN_PROMPT(article) }],
    });
    linkedinText = msg.content[0]?.text ?? '';
  } catch (err) {
    console.error('Claude LinkedIn error:', err);
    return res.status(502).json({ error: 'Claude API request failed', detail: err.message });
  }

  let xOptions = [];
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: NEWS_X_PROMPT(article) }],
    });
    const raw = msg.content[0]?.text ?? '{}';
    const parsed = JSON.parse(raw);
    xOptions = Array.isArray(parsed.options) ? parsed.options : [];
  } catch (err) {
    console.error('Claude X error:', err);
    // non-fatal — save with empty x options
  }

  const source = JSON.stringify({
    headline: article.headline,
    url: article.url,
    date: article.date,
  });
  const content = JSON.stringify({ linkedin: linkedinText, x: xOptions });

  const insert = db.prepare(
    'INSERT INTO drafts (module, platform, source_data, generated_content) VALUES (?, ?, ?, ?)'
  );
  const result = insert.run('news', 'both', source, content);
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json(draft);
});

// POST /api/news/generate-all — generate for all mock articles in sequence
router.post('/generate-all', async (req, res) => {
  const db = getDb();
  const apiKeySetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key');
  const apiKey = apiKeySetting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });
  const drafts = [];

  for (const article of MOCK_ARTICLES) {
    let linkedinText = '';
    let xOptions = [];

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: NEWS_LINKEDIN_PROMPT(article) }],
      });
      linkedinText = msg.content[0]?.text ?? '';
    } catch (err) {
      console.error(`Claude LinkedIn error for "${article.headline}":`, err);
    }

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: NEWS_X_PROMPT(article) }],
      });
      const raw = msg.content[0]?.text ?? '{}';
      const parsed = JSON.parse(raw);
      xOptions = Array.isArray(parsed.options) ? parsed.options : [];
    } catch (err) {
      console.error(`Claude X error for "${article.headline}":`, err);
    }

    const source = JSON.stringify({
      headline: article.headline,
      url: article.url,
      date: article.date,
    });
    const content = JSON.stringify({ linkedin: linkedinText, x: xOptions });

    const result = db
      .prepare('INSERT INTO drafts (module, platform, source_data, generated_content) VALUES (?, ?, ?, ?)')
      .run('news', 'both', source, content);
    const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);
    drafts.push(draft);
  }

  res.status(201).json(drafts);
});

export default router;
