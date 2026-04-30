export class BaseAgent {
  constructor(scope) {
    this.scope = scope;
  }

  async loadContext(db) {
    const performance = db.prepare(`
      SELECT d.id, d.module, d.platform, d.source_data,
             d.generated_content, d.edited_text, d.created_at,
             p.likes, p.comments, p.shares, p.impressions,
             p.engagement_rate, p.posted_at
      FROM drafts d
      LEFT JOIN post_performance p ON p.draft_id = d.id
      WHERE d.agent_scope = ?
        AND d.approved = 1
        AND d.posted_at IS NOT NULL
      ORDER BY d.created_at DESC
      LIMIT 30
    `).all(this.scope);

    const scopeLearning = db.prepare(
      'SELECT * FROM learnings WHERE scope = ?'
    ).get(this.scope);

    const globalLearning = db.prepare(
      'SELECT * FROM learnings WHERE scope = ?'
    ).get('global');

    const activeVersion = db.prepare(`
      SELECT * FROM prompt_versions
      WHERE scope = ? AND active = 1
      ORDER BY version DESC LIMIT 1
    `).get(this.scope);

    return {
      performance,
      scopeLearning,
      globalLearning,
      activeVersion,
      promptVersion: activeVersion?.version ?? 0,
      learningApplied: scopeLearning?.patch_approved === 1,
    };
  }

  resolvePrompt(basePromptText, context) {
    if (!context.learningApplied || !context.scopeLearning?.prompt_patch) {
      return basePromptText;
    }
    return basePromptText + '\n\n' + context.scopeLearning.prompt_patch;
  }

  formatPerformanceContext(performance) {
    if (!performance || performance.length === 0) return '';

    const withEngagement = performance.filter(p => p.engagement_rate > 0);
    const avg = withEngagement.length > 0
      ? withEngagement.reduce((sum, p) => sum + p.engagement_rate, 0) / withEngagement.length
      : 0;

    const top = [...performance].sort((a, b) => b.engagement_rate - a.engagement_rate)[0];

    const lines = [
      `PERFORMANCE CONTEXT (${performance.length} recent posts):`,
      `Average engagement rate: ${(avg * 100).toFixed(2)}%`,
    ];

    if (top?.engagement_rate > 0) {
      const topSource = JSON.parse(top.source_data || '{}');
      const topLabel = topSource.topic || topSource.headline || 'unknown';
      lines.push(
        `Top post: "${topLabel}" — ${(top.engagement_rate * 100).toFixed(2)}% engagement`
      );
    }

    return '\n\n' + lines.join('\n');
  }

  saveLog(db, draftId, steps, context) {
    db.prepare(`
      INSERT INTO agent_logs
        (draft_id, scope, steps, prompt_version, performance_posts_used, learning_applied)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      draftId,
      this.scope,
      JSON.stringify(steps),
      context.promptVersion,
      context.performance?.length ?? 0,
      context.learningApplied ? 1 : 0
    );
  }
}
