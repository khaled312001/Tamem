// Dev-only web screenshot harness. Logs in via the API, injects the session
// into the Expo-web localStorage, waits for the target screen, screenshots.
// Usage: node web-shot.mjs <out.png> [waitMs] [clickSelectorOrText...]
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:8082';
const API = 'https://backendtamem.deliverytamem.com/api/v1';
const OUT = process.argv[2] || 'shot.png';
const WAIT = Number(process.argv[3] || 7000);

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: '01000000091', password: 'TamemTest2026' }),
}).then((r) => r.json());
const { user, tokens } = login.data;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
  defaultViewport: { width: 430, height: 920, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.setCacheEnabled(false); // always fetch the fresh Metro bundle
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  (u, t) => {
    localStorage.setItem('tamem_access_token', t.accessToken);
    localStorage.setItem('tamem_refresh_token', t.refreshToken);
    localStorage.setItem('tamem_user', JSON.stringify(u));
  },
  user,
  tokens,
);
await page.reload({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, WAIT));

// Optional: dismiss an onboarding tour if a "تخطي" button is present.
try {
  const skipped = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span,button,a')];
    const skip = els.find((e) => e.textContent && e.textContent.trim() === 'تخطي');
    if (skip) {
      skip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }
    return false;
  });
  if (skipped) await new Promise((r) => setTimeout(r, 1500));
} catch {
  /* none */
}

// Optional: click an element whose text matches argv[4], then wait + screenshot.
const CLICK = process.argv[4];
if (CLICK) {
  const clicked = await page.evaluate((txt) => {
    const els = [...document.querySelectorAll('div,span,button,a,text')];
    // deepest element whose trimmed text equals the target
    const match = els
      .filter((e) => e.textContent && e.textContent.trim() === txt)
      .sort((a, b) => b.compareDocumentPosition(a) & 8 ? 1 : -1)[0];
    if (match) {
      const t = match.closest('[role="button"]') || match;
      t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }
    return false;
  }, CLICK);
  console.log('clicked', JSON.stringify(CLICK), '->', clicked);
  await new Promise((r) => setTimeout(r, 4000));
}

await page.screenshot({ path: OUT });
await browser.close();
console.log('shot ->', OUT, '| user:', user.name);
