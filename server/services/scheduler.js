import cron from 'node-cron';
import { publishToLinkedIn } from './linkedinPublisher.js';

export function startScheduler(db) {
  cron.schedule('* * * * *', async () => {
    const due = db.prepare(`
      SELECT * FROM drafts
      WHERE approved = 1
        AND rejected = 0
        AND posted_at IS NULL
        AND scheduled_at <= datetime('now')
    `).all();

    for (const draft of due) {
      try {
        let text;
        try {
          const content = JSON.parse(draft.generated_content || '{}');
          text = draft.edited_text || content.linkedin || '';
        } catch {
          text = draft.edited_text || '';
        }

        if (!text) {
          console.warn(`[scheduler] Draft ${draft.id} has no text, skipping`);
          continue;
        }

        const { postId, postUrl } = await publishToLinkedIn(text, db);

        db.prepare(`
          UPDATE drafts
          SET posted_at        = ?,
              linkedin_post_id = ?,
              post_url         = ?,
              posted_platform  = 'linkedin'
          WHERE id = ?
        `).run(new Date().toISOString(), postId || null, postUrl || null, draft.id);

        console.log(`[scheduler] Posted draft ${draft.id} → ${postUrl}`);
      } catch (err) {
        console.error(`[scheduler] Failed to post draft ${draft.id}:`, err.message);
      }
    }
  });

  console.log('[scheduler] Started — checking every minute for due posts');
}
