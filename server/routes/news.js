import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { scrapeMaddb } from '../scrapers/maddb.js';
import { NewsResearcher } from '../agents/researchers/newsResearcher.js';
import { LinkedinNewsAgent } from '../agents/writers/linkedinNewsAgent.js';
import { XNewsAgent } from '../agents/writers/xNewsAgent.js';

const router = Router();
const CACHE_HOURS = 6;

// GET /api/news/fetch — scrape + filter via researcher
router.get('/fetch', async (req, res) => {
  const db = getDb();
  const apiKey = db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get('anthropic_api_key')?.value || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  const cached = db.prepare(`
    SELECT * FROM news_cache ORDER BY scraped_at DESC LIMIT 1
  `).get();

  const cacheAge = cached
    ? (Date.now() - new Date(cached.scraped_at).getTime()) / (1000 * 60 * 60)
    : Infinity;

  let articles;
  let stale = false;
  let scrapedAt;

  if (cached && cacheAge < CACHE_HOURS && req.query.force !== 'true') {
    articles = JSON.parse(cached.articles);
    scrapedAt = cached.scraped_at;
  } else {
    try {
      articles = await scrapeMaddb();
      scrapedAt = new Date().toISOString();
      db.prepare('INSERT INTO news_cache (articles) VALUES (?)').run(JSON.stringify(articles));
    } catch (err) {
      console.error('Scrape failed:', err);
      if (cached) {
        articles = JSON.parse(cached.articles);
        scrapedAt = cached.scraped_at;
        stale = true;
      } else {
        return res.status(502).json({
          error: 'Scrape failed and no cache available',
          detail: err.message
        });
      }
    }
  }

  const client = new Anthropic({ apiKey });
  const researcher = new NewsResearcher();

  try {
    const { enriched, skipped, steps } = await researcher.research(articles, db, client);
    res.json({
      articles: enriched,
      skipped,
      researcher_steps: steps,
      total_scraped: articles.length,
      scraped_at: scrapedAt,
      stale
    });
  } catch (err) {
    console.error('Researcher failed:', err);
    res.status(500).json({
      error: 'Research failed',
      detail: err.message,
      raw_articles: articles
    });
  }
});

// POST /api/news/generate — generate drafts for one article
router.post('/generate', async (req, res) => {
  const { article } = req.body;
  if (!article?.headline) {
    return res.status(400).json({ error: 'Provide article object' });
  }

  const db = getDb();
  const apiKey = db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get('anthropic_api_key')?.value || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  const client = new Anthropic({ apiKey });
  const liAgent = new LinkedinNewsAgent();
  const xAgent = new XNewsAgent();

  let linkedinResult;
  try {
    linkedinResult = await liAgent.generate(article, db, client);
  } catch (err) {
    return res.status(502).json({ error: 'LinkedIn generation failed', detail: err.message });
  }

  let xOptions = [];
  try {
    const xResult = await xAgent.generate(article, db, client);
    const cleaned = xResult.text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    xOptions = Array.isArray(parsed.options) ? parsed.options : [];
  } catch (err) {
    console.error('X generation failed:', err);
  }

  const source = JSON.stringify({
    headline: article.headline,
    url: article.url,
    date: article.date,
    reason: article.reason,
    suggested_angle: article.suggested_angle
  });
  const content = JSON.stringify({ linkedin: linkedinResult.text, x: xOptions });

  const result = db.prepare(`
    INSERT INTO drafts (
      module, platform, source_data, generated_content,
      agent_scope, prompt_version, learning_applied
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'news', 'both', source, content,
    'linkedin_news',
    linkedinResult.context?.promptVersion ?? 0,
    linkedinResult.context?.learningApplied ? 1 : 0
  );

  liAgent.saveLog(db, result.lastInsertRowid, linkedinResult.steps, linkedinResult.context);

  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(draft);
});

// POST /api/news/generate-all
router.post('/generate-all', async (req, res) => {
  const { articles } = req.body;
  if (!Array.isArray(articles)) {
    return res.status(400).json({ error: 'Provide articles array' });
  }

  const db = getDb();
  const apiKey = db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get('anthropic_api_key')?.value || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  const client = new Anthropic({ apiKey });
  const liAgent = new LinkedinNewsAgent();
  const xAgent = new XNewsAgent();
  const drafts = [];

  for (const article of articles) {
    try {
      const linkedinResult = await liAgent.generate(article, db, client);
      let xOptions = [];
      try {
        const xResult = await xAgent.generate(article, db, client);
        const cleaned = xResult.text.replace(/```json\n?|\n?```/g, '').trim();
        xOptions = JSON.parse(cleaned).options || [];
      } catch {}

      const source = JSON.stringify({
        headline: article.headline,
        url: article.url,
        date: article.date,
        reason: article.reason,
        suggested_angle: article.suggested_angle
      });
      const content = JSON.stringify({ linkedin: linkedinResult.text, x: xOptions });

      const result = db.prepare(`
        INSERT INTO drafts (
          module, platform, source_data, generated_content,
          agent_scope, prompt_version, learning_applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'news', 'both', source, content,
        'linkedin_news',
        linkedinResult.context?.promptVersion ?? 0,
        linkedinResult.context?.learningApplied ? 1 : 0
      );

      liAgent.saveLog(db, result.lastInsertRowid, linkedinResult.steps, linkedinResult.context);
      drafts.push(db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
      console.error(`Failed for ${article.headline}:`, err);
    }
  }

  res.status(201).json(drafts);
});

export default router;
