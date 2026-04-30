import { BaseAgent } from './base.js';

const SCOPES = ['linkedin_news', 'linkedin_education', 'linkedin_personal', 'x_news', 'x_general'];

export class LearningAgent extends BaseAgent {
  constructor() {
    super('global');
  }

  async run(db, client) {
    const results = [];

    for (const scope of SCOPES) {
      const posts = db.prepare(`
        SELECT d.*, p.engagement_rate, p.likes, p.comments, p.impressions
        FROM drafts d
        LEFT JOIN post_performance p ON p.draft_id = d.id
        WHERE d.agent_scope = ? AND d.approved = 1
        ORDER BY d.created_at DESC LIMIT 60
      `).all(scope);

      if (posts.length < 5) {
        results.push({ scope, skipped: true, reason: `Only ${posts.length} posts, need 5+` });
        continue;
      }

      const currentLearning = db.prepare('SELECT * FROM learnings WHERE scope = ?').get(scope);

      const postSummaries = posts.map(p => {
        let sourceData = {};
        try { sourceData = JSON.parse(p.source_data || '{}'); } catch { /* ignore */ }
        let generatedContent = {};
        try { generatedContent = JSON.parse(p.generated_content || '{}'); } catch { /* ignore */ }
        return {
          topic: sourceData.topic || sourceData.headline,
          hook: (p.edited_text || generatedContent.linkedin || '')
            .split('\n')[0].slice(0, 120),
          engagement_rate: p.engagement_rate || 0,
          likes: p.likes || 0,
          comments: p.comments || 0,
          posted_at: p.posted_at,
        };
      });

      const LEARNING_PROMPT = `You are analyzing LinkedIn post performance for Vlad Chubakov (@101Programmatic), a programmatic advertising strategist.

SCOPE: ${scope}

CURRENT RUNNING NOTES:
${currentLearning?.running_notes || 'None yet.'}

POST PERFORMANCE DATA (${posts.length} posts):
${JSON.stringify(postSummaries, null, 2)}

YOUR TASKS:

1. Write 2-3 new observations to APPEND to running_notes.
   Be specific — reference actual posts and numbers.
   Example: "Posts with specific metrics in hook average X% vs Y% for opinion openers (n=8 vs n=12)"

2. Decide if a prompt patch is warranted. Only recommend one if:
   - You have 10+ posts with engagement data
   - Pattern is consistent across 3+ posts
   - Change is specific and testable

3. If patch warranted, write it as instructions to append to the base prompt:
   "LEARNED GUIDANCE (from N posts):
   - [specific actionable instruction]
   - [specific thing to avoid]"

Return ONLY valid JSON:
{
  "new_observations": "text to append to running_notes",
  "patch_warranted": true,
  "prompt_patch": "patch text or null",
  "reasoning": "why patch is or isn't needed",
  "confidence": "high/medium/low",
  "data_points": ${posts.length}
}`;

      try {
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: LEARNING_PROMPT }],
        });

        const raw = msg.content[0]?.text ?? '{}';
        const analysis = JSON.parse(raw);

        const newNotes =
          (currentLearning?.running_notes || '') +
          `\n\n[${new Date().toISOString().split('T')[0]}]: ` +
          analysis.new_observations;

        const updateFields = {
          running_notes: newNotes,
          updated_at: new Date().toISOString(),
        };

        if (analysis.patch_warranted && analysis.prompt_patch) {
          updateFields.prompt_patch = analysis.prompt_patch;
          updateFields.patch_approved = 0;
          updateFields.version = (currentLearning?.version || 0) + 1;

          db.prepare(`
            INSERT INTO prompt_versions (scope, version, prompt_text, active)
            VALUES (?, ?, ?, 0)
          `).run(scope, updateFields.version, analysis.prompt_patch);
        }

        db.prepare(`
          UPDATE learnings SET
            running_notes  = ?,
            prompt_patch   = COALESCE(?, prompt_patch),
            patch_approved = COALESCE(?, patch_approved),
            version        = COALESCE(?, version),
            updated_at     = ?
          WHERE scope = ?
        `).run(
          updateFields.running_notes,
          updateFields.prompt_patch ?? null,
          updateFields.patch_approved ?? null,
          updateFields.version ?? null,
          updateFields.updated_at,
          scope
        );

        results.push({
          scope,
          patch_warranted: analysis.patch_warranted,
          confidence: analysis.confidence,
          data_points: analysis.data_points,
        });
      } catch (err) {
        results.push({ scope, error: err.message });
      }
    }

    return results;
  }
}
