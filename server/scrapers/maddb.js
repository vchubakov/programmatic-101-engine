import https from 'https';
import http from 'http';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function extractArticles(html) {
  const articles = [];
  
  // Extract JSON-LD structured data first (most reliable)
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'NewsArticle' || item['@type'] === 'Article') {
          articles.push({
            headline: item.headline || item.name,
            summary: item.description,
            url: item.url || item.mainEntityOfPage?.['@id'],
            date: item.datePublished
          });
        }
      }
    } catch {}
  }
  
  if (articles.length > 3) return articles.slice(0, 20);

  // Fallback: extract from meta tags and og tags
  const ogTitles = [...html.matchAll(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/g)].map(m => m[1]);
  const ogDescs = [...html.matchAll(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/g)].map(m => m[1]);
  const ogUrls = [...html.matchAll(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/g)].map(m => m[1]);

  // Extract article links with titles from anchor tags
  const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]*)"[^>]*>\s*<[^>]*>\s*([^<]{20,200})\s*</g)];
  
  // Extract h2/h3 tags as potential headlines
  const headlineMatches = [...html.matchAll(/<h[23][^>]*>([^<]{20,200})<\/h[23]>/g)];
  
  for (const match of headlineMatches.slice(0, 20)) {
    const headline = match[1].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (headline.length > 20 && headline.length < 300) {
      articles.push({
        headline,
        summary: '',
        url: 'https://maddb.ai/trending',
        date: new Date().toISOString().split('T')[0]
      });
    }
  }

  return articles.filter(a => a.headline).slice(0, 20);
}

export async function scrapeMaddb() {
  const html = await fetchUrl('https://maddb.ai/trending');
  const articles = extractArticles(html);
  
  if (articles.length === 0) {
    throw new Error('No articles extracted from maddb.ai - site structure may have changed');
  }
  
  return articles;
}
