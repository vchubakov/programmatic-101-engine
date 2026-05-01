import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

function findChromium() {
  const paths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/nix/var/nix/profiles/default/bin/chromium',
  ].filter(Boolean);

  for (const p of paths) {
    try {
      execSync('test -f ' + p, { stdio: 'ignore' });
      return p;
    } catch {}
  }

  try {
    const found = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null',
      { encoding: 'utf8' }
    ).trim().split('\n')[0];
    if (found) return found;
  } catch {}

  return null;
}

export async function scrapeMaddb() {
  const execPath = findChromium();
  console.log('Chromium found at:', execPath);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
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
