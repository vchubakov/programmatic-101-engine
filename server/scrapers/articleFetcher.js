import https from 'https';
import http from 'http';

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      }
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function extractMainText(html) {
  // Remove scripts, styles, nav, footer, ads
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Take first 3000 chars — enough context without blowing token budget
  return text.slice(0, 3000);
}

export async function fetchArticleContent(url) {
  try {
    const html = await fetchHtml(url);
    const text = extractMainText(html);
    return { url, text, success: true };
  } catch (err) {
    return { url, text: '', success: false, error: err.message };
  }
}

export async function fetchMultipleArticles(urls, concurrency = 3) {
  const results = [];
  // Fetch in batches to avoid overwhelming publishers
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchArticleContent));
    results.push(...batchResults);
    // Small delay between batches
    if (i + concurrency < urls.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return results;
}
