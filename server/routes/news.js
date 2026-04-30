import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { MOCK_ARTICLES } from '../mock/news.js';
import { LinkedinNewsAgent } from '../agents/writers/linkedinNewsAgent.js';
import { XNewsAgent } from '../agents/writers/xNewsAgent.js';

const router = Router();
const linkedinAgent = new LinkedinNewsAgent();
const xAgent = new XNewsAgent();

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

  let linkedinText, liSteps, liContext;
  try {
    ({ text: linkedinText, steps: liSteps, context: liContext } =
      await linkedinAgent.generate(article, db, client));
  } catch (err) {
    console.error('Claude LinkedIn error:', err);
    return res.status(502).json({ error: 'Claude API request failed', detail: err.message });
  }

  let xOptions = [];
  let xSteps, xContext;
  try {
    const { text: xRaw, steps: xs, context: xc } = await xAgent.generate(article, db, client);
    xSteps = xs;
    xContext = xc;
    const parsed = JSON.parse(xRaw);
    xOptions = Array.isArray(parsed.options) ? parsed.options : [];
  } catch (err) {
    console.error('Claude X error:', err);
    // non-fatal — save with empty x options
  }

  const source = JSON.stringify({ headline: article.headline, url: article.url, date: article.date });
  const content = JSON.stringify({ linkedin: linkedinText, x: xOptions });

  const result = db.prepare(
    `INSERT INTO drafts
       (module, platform, source_data, generated_content, agent_scope, prompt_version, learning_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('news', 'both', source, content, linkedinAgent.scope, liContext.promptVersion, liContext.learningApplied ? 1 : 0);

  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);

  linkedinAgent.saveLog(db, draft.id, liSteps, liContext);
  if (xSteps && xContext) xAgent.saveLog(db, draft.id, xSteps, xContext);

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
    let liSteps, liContext;
    let xOptions = [];
    let xSteps, xContext;

    try {
      ({ text: linkedinText, steps: liSteps, context: liContext } =
        await linkedinAgent.generate(article, db, client));
    } catch (err) {
      console.error(`Claude LinkedIn error for "${article.headline}":`, err);
    }

    try {
      const { text: xRaw, steps: xs, context: xc } = await xAgent.generate(article, db, client);
      xSteps = xs;
      xContext = xc;
      const parsed = JSON.parse(xRaw);
      xOptions = Array.isArray(parsed.options) ? parsed.options : [];
    } catch (err) {
      console.error(`Claude X error for "${article.headline}":`, err);
    }

    const source = JSON.stringify({ headline: article.headline, url: article.url, date: article.date });
    const content = JSON.stringify({ linkedin: linkedinText, x: xOptions });

    const result = db.prepare(
      `INSERT INTO drafts
         (module, platform, source_data, generated_content, agent_scope, prompt_version, learning_applied)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'news', 'both', source, content,
      linkedinAgent.scope,
      liContext?.promptVersion ?? 0,
      liContext?.learningApplied ? 1 : 0
    );
    const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);

    if (liSteps && liContext) linkedinAgent.saveLog(db, draft.id, liSteps, liContext);
    if (xSteps && xContext) xAgent.saveLog(db, draft.id, xSteps, xContext);

    drafts.push(draft);
  }

  res.status(201).json(drafts);
});

export default router;
