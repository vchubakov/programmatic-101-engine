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

      // Fetch edit pattern data
      const editStats = db.prepare(`
        SELECT
          edit_diff,
          feedback_rating,
          feedback_note,
          original_generated_text,
          edited_text,
          created_at
        FROM drafts
        WHERE agent_scope = ?
          AND approved = 1
          AND edit_diff IS NOT NULL
          AND created_at > datetime('now', '-60 days')
        ORDER BY created_at DESC
        LIMIT 30
      `).all(scope);

      const editData = buildEditData(editStats);

      const LEARNING_PROMPT = `You are analyzing LinkedIn post performance for Vlad Chubakov (@101Programmatic), a programmatic advertising strategist.

SCOPE: ${scope}

CURRENT RUNNING NOTES:
${currentLearning?.running_notes || 'None yet.'}

POST PERFORMANCE DATA (${posts.length} posts):
${JSON.stringify(postSummaries, null, 2)}

EDIT PATTERN DATA (last 30 approved posts, this scope):
${editData}

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

4. Analyze edit patterns:
   - If edit_ratio consistently > 0.3: drafts need significant rework — what patterns show in the before/after examples?
   - If feedback_notes mention specific issues repeatedly: address those directly in the prompt patch
   - If 'missed_point' ratings are high: the angle selection or hook formula needs adjustment

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

function buildEditData(editStats) {
  if (!editStats.length) return 'No edit data yet.';

  const parsed = editStats.map(r => {
    let diff = {};
    try { diff = JSON.parse(r.edit_diff || '{}'); } catch { /* ignore */ }
    return { ...r, diff };
  });

  const highEdit    = parsed.filter(r => r.diff.edit_ratio > 0.3);
  const avgRatio    = parsed.reduce((s, r) => s + (r.diff.edit_ratio || 0), 0) / parsed.length;
  const ratings     = { good: 0, needed_work: 0, missed_point: 0 };
  const notes       = [];

  for (const r of parsed) {
    if (r.feedback_rating && ratings[r.feedback_rating] !== undefined) {
      ratings[r.feedback_rating]++;
    }
    if (r.feedback_note) notes.push(r.feedback_note);
  }

  const examples = highEdit.slice(0, 3).map(r => ({
    original_preview: (r.original_generated_text || '').slice(0, 100),
    final_preview:    (r.edited_text || '').slice(0, 100),
    edit_ratio:       r.diff.edit_ratio,
  }));

  return `- Posts with high edit ratio (>0.3): ${highEdit.length} out of ${parsed.length}
- Average edit ratio: ${avgRatio.toFixed(3)}
- Feedback ratings: good(${ratings.good}) / needed_work(${ratings.needed_work}) / missed_point(${ratings.missed_point})
- Feedback notes: ${notes.length ? notes.map(n => `"${n}"`).join(', ') : 'none'}
- Substantially rewritten examples:
${examples.length ? JSON.stringify(examples, null, 2) : '  (none)'}`;
}
