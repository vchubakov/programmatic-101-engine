import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/index.js';
import { LinkedinEducationAgent } from '../agents/writers/linkedinEducationAgent.js';

const router = Router();
const agent = new LinkedinEducationAgent();

router.post('/generate', async (req, res) => {
  const { topic_id, custom_topic } = req.body;

  if (!topic_id && !custom_topic?.trim()) {
    return res.status(400).json({ error: 'Provide topic_id or custom_topic' });
  }

  const db = getDb();

  let topicText;
  let topicRow = null;

  if (topic_id) {
    topicRow = db.prepare('SELECT * FROM topics WHERE id = ?').get(topic_id);
    if (!topicRow) return res.status(404).json({ error: 'Topic not found' });
    topicText = topicRow.title;
  } else {
    topicText = custom_topic.trim();
  }

  const apiKeySetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key');
  const apiKey = apiKeySetting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });

  let postText, steps, context;
  try {
    ({ text: postText, steps, context } = await agent.generate(topicText, db, client));
  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(502).json({ error: 'Claude API request failed', detail: err.message });
  }

  const source = JSON.stringify(topicRow ? { topic_id: topicRow.id, topic: topicText } : { topic: topicText });
  const content = JSON.stringify({ linkedin: postText });

  const result = db.prepare(
    `INSERT INTO drafts
       (module, platform, source_data, generated_content, agent_scope, prompt_version, learning_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('education', 'linkedin', source, content, agent.scope, context.promptVersion, context.learningApplied ? 1 : 0);

  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(result.lastInsertRowid);

  agent.saveLog(db, draft.id, steps, context);

  if (topicRow) {
    db.prepare(`UPDATE topics SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(topicRow.id);
  }

  res.status(201).json(draft);
});

export default router;
