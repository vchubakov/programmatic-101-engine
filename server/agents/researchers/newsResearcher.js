import { BaseAgent } from '../base.js';

export class NewsResearcher extends BaseAgent {
  constructor() { super('news_researcher'); }

  async research(articles, db, client) {
    const steps = [];

    const recentDrafts = db.prepare(`
      SELECT source_data, created_at
      FROM drafts
      WHERE module = 'news'
        AND created_at > datetime('now', '-60 days')
      ORDER BY created_at DESC
    `).all();

    const recentTopics = recentDrafts.map(d => {
      try {
        return JSON.parse(d.source_data || '{}').headline || '';
      } catch { return ''; }
    }).filter(Boolean);

    steps.push({
      step: 'dedup_check',
      recent_post_count: recentTopics.length
    });

    const FILTER_PROMPT = `You are filtering news for Vlad Chubakov, a programmatic advertising strategist (@101Programmatic). His audience: media buyers, traders, adtech professionals.

His content pillars: DSP deep-dives (TTD, DV360, Amazon DSP), optimization traps, measurement & attribution, supply quality, CTV, AI/agentic reality checks.

RECENT TOPICS HE'S COVERED (last 60 days — avoid duplicates):
${recentTopics.length > 0
  ? recentTopics.slice(0, 30).map(t => `- ${t}`).join('\n')
  : 'None.'}

TODAY'S CANDIDATE ARTICLES:
${articles.map((a, i) =>
  `[${i}] ${a.headline}\n    ${a.summary || 'No summary'}\n    ${a.url}`
).join('\n\n')}

YOUR JOB:
1. Pick the 3 most relevant articles for Vlad's audience
2. For each, explain WHY it's worth covering
3. Suggest a fresh angle that hasn't been covered recently
4. Skip duplicates of recent topics

Prioritize:
- Platform changes with real buyer impact
- Surprising data or contrarian angles
- Measurement/AI news with practical implications

Return ONLY valid JSON:
{
  "selected": [
    {
      "index": 0,
      "headline": "exact headline from list",
      "url": "url",
      "reason": "why this matters to Vlad's audience",
      "suggested_angle": "fresh angle not covered recently",
      "is_duplicate_risk": false
    }
  ],
  "skipped": [
    {"headline": "...", "reason": "why skipped"}
  ]
}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: FILTER_PROMPT }]
    });

    const raw = msg.content[0]?.text ?? '{}';
    let analysis;
    try {
      const clean = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      analysis = JSON.parse(clean);
    } catch (err) {
      throw new Error('Researcher failed to parse JSON: ' + raw.slice(0, 300));
    }

    steps.push({
      step: 'filter_complete',
      selected_count: analysis.selected?.length ?? 0,
      skipped_count: analysis.skipped?.length ?? 0
    });

    const enriched = (analysis.selected || []).map(s => ({
      ...articles[s.index],
      reason: s.reason,
      suggested_angle: s.suggested_angle,
      is_duplicate_risk: s.is_duplicate_risk ?? false
    }));

    return {
      enriched,
      skipped: analysis.skipped || [],
      steps
    };
  }
}
