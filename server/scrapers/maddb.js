import https from 'https';

const MADDB_URL = 'https://app.maddb.ai/rest/v1/news_cache?select=data&cache_key=eq.latest';
const MADDB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnVkeWl3YWNycGtiZXpyenphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2MDUzODAsImV4cCI6MjA1NjE4MTM4MH0.r4hH5Da7W2i_pGfqXhfkX4KJqbSzM9Hym5Zan26pqis';

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function scrapeMaddb() {
  const result = await fetchJson(MADDB_URL, {
    'apikey': MADDB_KEY,
    'Authorization': 'Bearer ' + MADDB_KEY,
    'Accept': 'application/json',
    'Accept-Profile': 'public',
  });

  if (!Array.isArray(result) || !result[0]?.data) {
    throw new Error('Unexpected response from maddb.ai API');
  }

  return result[0].data
    .filter(a => a.title && a.url)
    .slice(0, 20)
    .map(a => ({
      headline: a.title,
      summary: a.snippet || '',
      url: a.url,
      date: a.published_at
        ? a.published_at.split('T')[0]
        : new Date().toISOString().split('T')[0],
      source: a.favicon || '',
      ai_score: a.ai_score ?? 0
    }));
}
