import puppeteer from 'puppeteer';

export async function scrapeMaddb() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto('https://maddb.ai/trending', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector(
      'article, .article, .post, [class*="story"], [class*="news"]',
      { timeout: 10000 }
    ).catch(() => {});

    const articles = await page.evaluate(() => {
      const selectors = [
        'article',
        '.article-card',
        '.story-card',
        '[class*="article"]',
        '[class*="story"]',
        '[class*="trending"]'
      ];

      let elements = [];
      for (const sel of selectors) {
        elements = document.querySelectorAll(sel);
        if (elements.length > 3) break;
      }

      return Array.from(elements).slice(0, 20).map(el => {
        const headline = el.querySelector(
          'h1, h2, h3, h4, [class*="title"], [class*="headline"]'
        )?.innerText?.trim();

        const summary = el.querySelector(
          'p, [class*="summary"], [class*="description"], [class*="excerpt"]'
        )?.innerText?.trim();

        const link = el.querySelector('a')?.href;

        const dateEl = el.querySelector('time, [class*="date"], [datetime]');
        const date = dateEl?.getAttribute('datetime') || dateEl?.innerText?.trim();

        return { headline, summary, url: link, date };
      }).filter(a => a.headline && a.url);
    });

    return articles;
  } finally {
    await browser.close();
  }
}
