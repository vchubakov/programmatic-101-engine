import https from 'https';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)',
        'Accept': 'application/json',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Non-JSON response from ' + url));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout fetching ' + url)); });
  });
}

export async function scrapeMaddb() {
  const data = await getJson('https://app.maddb.ai/api/trending');

  const items = Array.isArray(data) ? data
    : Array.isArray(data?.articles) ? data.articles
    : Array.isArray(data?.stories) ? data.stories
    : Array.isArray(data?.data) ? data.data
    : [];

  return items.slice(0, 20).map(item => ({
    headline: item.headline || item.title || item.name || '',
    summary: item.summary || item.description || item.excerpt || '',
    url: item.url || item.link || item.href || '',
    date: item.date || item.published_at || item.created_at || '',
    ai_score: item.ai_score || item.score || 0,
  })).filter(a => a.headline && a.url);
}
