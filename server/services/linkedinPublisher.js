const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_UGC_URL   = 'https://api.linkedin.com/v2/ugcPosts';

export async function publishToLinkedIn(text, db) {
  let tokenRow = db.prepare(
    'SELECT * FROM linkedin_tokens ORDER BY id DESC LIMIT 1'
  ).get();

  if (!tokenRow) throw new Error('LinkedIn not connected');

  const daysUntilExpiry =
    (new Date(tokenRow.expires_at) - new Date()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry < 7 && tokenRow.refresh_token) {
    await refreshLinkedInToken(db);
    tokenRow = db.prepare(
      'SELECT * FROM linkedin_tokens ORDER BY id DESC LIMIT 1'
    ).get();
  }

  const body = {
    author: `urn:li:person:${tokenRow.linkedin_user_id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary:  { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch(LINKEDIN_UGC_URL, {
    method:  'POST',
    headers: {
      Authorization:               `Bearer ${tokenRow.access_token}`,
      'Content-Type':              'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LinkedIn API error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const postId = result.id || response.headers.get('x-restli-id');

  return {
    postId,
    postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}/` : null,
  };
}

async function refreshLinkedInToken(db) {
  const tokenRow = db.prepare(
    'SELECT * FROM linkedin_tokens ORDER BY id DESC LIMIT 1'
  ).get();

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokenRow.refresh_token,
    client_id:     process.env.LINKEDIN_CLIENT_ID     || '',
    client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
  });

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  });

  const data      = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  db.prepare(`
    UPDATE linkedin_tokens
    SET access_token = ?, expires_at = ?, updated_at = ?
    WHERE id = ?
  `).run(data.access_token, expiresAt, new Date().toISOString(), tokenRow.id);
}
