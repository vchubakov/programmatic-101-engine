import { BaseAgent } from '../base.js';
import { fetchMultipleArticles } from '../../scrapers/articleFetcher.js';

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

    const topArticles = articles
      .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))
      .slice(0, 10);

    const articleContents = await fetchMultipleArticles(topArticles.map(a => a.url));

    const articlesWithContent = topArticles.map((article, i) => ({
      ...article,
      fullText: articleContents[i]?.text || ''
    }));

    steps.push({
      step: 'articles_fetched',
      fetched: articleContents.filter(a => a.success).length,
      failed: articleContents.filter(a => !a.success).length
    });

    const FILTER_PROMPT = `You are filtering news for Vlad Chubakov, a programmatic advertising strategist (@101Programmatic). His audience: media buyers, traders, adtech professionals.

His content pillars: DSP deep-dives (TTD, DV360, Amazon DSP), optimization traps, measurement & attribution, supply quality, CTV, AI/agentic reality checks.

RECENT TOPICS HE'S COVERED (last 60 days — avoid duplicates):
${recentTopics.length > 0
  ? recentTopics.slice(0, 30).map(t => `- ${t}`).join('\n')
  : 'None.'}

TODAY'S CANDIDATE ARTICLES:
${articlesWithContent.map((a, i) =>
  `[${i}] ${a.headline}
  Summary: ${a.summary || 'No summary'}
  Source: ${a.url}
  Article text: ${a.fullText
    ? a.fullText.slice(0, 800)
    : 'Could not fetch'}
  `
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
}

CRITICAL: Return raw JSON only. No markdown. No code fences. No backticks. Start your response with { and end with }`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: FILTER_PROMPT }]
    });

    const raw = msg.content[0]?.text ?? '{}';
    let analysis;
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
      analysis = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error('Researcher failed to return valid JSON: ' + raw.slice(0, 200));
    }

    steps.push({
      step: 'filter_complete',
      selected_count: analysis.selected?.length ?? 0,
      skipped_count: analysis.skipped?.length ?? 0
    });

    const enriched = (analysis.selected || []).map(s => ({
      ...articlesWithContent[s.index],
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
