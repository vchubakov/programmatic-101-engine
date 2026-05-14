import { Router } from 'express';
import { getDb } from '../db/index.js';
import { randomBytes, createHash } from 'crypto';

const router = Router();

const LINKEDIN_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO  = 'https://api.linkedin.com/v2/userinfo';
const SCOPES             = 'openid profile w_member_social email';

function redirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI ||
    'https://programmatic-101-engine-production.up.railway.app/auth/linkedin/callback';
}

function codeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

// GET /auth/linkedin/connect
router.get('/linkedin/connect', (req, res) => {
  const db = getDb();
  const state    = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('base64url');

  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  upsert.run('linkedin_oauth_state',         state);
  upsert.run('linkedin_oauth_code_verifier', verifier);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             process.env.LINKEDIN_CLIENT_ID || '',
    redirect_uri:          redirectUri(),
    state,
    scope:                 SCOPES,
    code_challenge:        codeChallenge(verifier),
    code_challenge_method: 'S256',
  });

  res.redirect(`${LINKEDIN_AUTH_URL}?${params}`);
});

// GET /auth/linkedin/callback
router.get('/linkedin/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/settings?error=${encodeURIComponent(error)}`);
  }

  const db = getDb();
  const storedState    = db.prepare('SELECT value FROM settings WHERE key = ?').get('linkedin_oauth_state')?.value;
  const storedVerifier = db.prepare('SELECT value FROM settings WHERE key = ?').get('linkedin_oauth_code_verifier')?.value;

  if (!storedState || state !== storedState) {
    return res.redirect('/settings?error=invalid_state');
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri(),
      client_id:     process.env.LINKEDIN_CLIENT_ID     || '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      code_verifier: storedVerifier || '',
    });

    const tokenRes  = await fetch(LINKEDIN_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    tokenParams,
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('LinkedIn token exchange failed:', tokenData);
      return res.redirect('/settings?error=token_exchange_failed');
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Fetch LinkedIn profile via OIDC userinfo
    const userRes  = await fetch(LINKEDIN_USERINFO, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const linkedinUserId = userData.sub;
    const linkedinName   = userData.name ||
      [userData.given_name, userData.family_name].filter(Boolean).join(' ') ||
      'LinkedIn User';

    db.prepare('DELETE FROM linkedin_tokens').run();
    db.prepare(`
      INSERT INTO linkedin_tokens
        (access_token, refresh_token, expires_at, linkedin_user_id, linkedin_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      tokenData.access_token,
      tokenData.refresh_token || null,
      expiresAt,
      linkedinUserId,
      linkedinName,
    );

    // Clean up oauth temp state
    db.prepare(`DELETE FROM settings WHERE key IN ('linkedin_oauth_state','linkedin_oauth_code_verifier')`).run();

    res.redirect('/settings?connected=true');
  } catch (err) {
    console.error('LinkedIn callback error:', err);
    res.redirect('/settings?error=callback_failed');
  }
});

// GET /auth/linkedin/status
router.get('/linkedin/status', (req, res) => {
  const db       = getDb();
  const tokenRow = db.prepare('SELECT * FROM linkedin_tokens ORDER BY id DESC LIMIT 1').get();

  if (!tokenRow) return res.json({ connected: false });

  const daysUntilExpiry = (new Date(tokenRow.expires_at) - new Date()) / (1000 * 60 * 60 * 24);

  res.json({
    connected:     true,
    name:          tokenRow.linkedin_name,
    expires_at:    tokenRow.expires_at,
    needs_refresh: daysUntilExpiry < 7,
  });
});

// POST /auth/linkedin/disconnect
router.post('/linkedin/disconnect', (req, res) => {
  getDb().prepare('DELETE FROM linkedin_tokens').run();
  res.json({ ok: true });
});

// POST /auth/linkedin/refresh
router.post('/linkedin/refresh', async (req, res) => {
  const db       = getDb();
  const tokenRow = db.prepare('SELECT * FROM linkedin_tokens ORDER BY id DESC LIMIT 1').get();

  if (!tokenRow?.refresh_token) {
    return res.status(400).json({ error: 'No refresh token available' });
  }

  try {
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
    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).json({ error: data.error || 'Refresh failed' });
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    db.prepare(`
      UPDATE linkedin_tokens
      SET access_token = ?, expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(data.access_token, expiresAt, new Date().toISOString(), tokenRow.id);

    res.json({ ok: true, expires_at: expiresAt });
  } catch (err) {
    console.error('LinkedIn refresh error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
