import { BaseAgent } from '../base.js';
import { NEWS_LINKEDIN_PROMPT } from '../../prompts/news.js';

export class LinkedinNewsAgent extends BaseAgent {
  constructor() {
    super('linkedin_news');
  }

  async generate(article, db, client) {
    const steps = [];

    const context = await this.loadContext(db);
    steps.push({
      step: 'context_loaded',
      performance_posts: context.performance?.length ?? 0,
      learning_applied: context.learningApplied,
    });

    const basePromptText = NEWS_LINKEDIN_PROMPT(article);
    const resolvedPrompt = this.resolvePrompt(basePromptText, context);
    const perfContext = this.formatPerformanceContext(context.performance);
    const finalPrompt = resolvedPrompt + perfContext;

    steps.push({
      step: 'prompt_resolved',
      version: context.promptVersion,
      patch_applied: context.learningApplied && !!context.scopeLearning?.prompt_patch,
    });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: finalPrompt }],
    });

    const text = msg.content[0]?.text ?? '';
    steps.push({
      step: 'generation_complete',
      tokens_used: msg.usage?.output_tokens ?? 0,
    });

    return { text, steps, context };
  }
}
