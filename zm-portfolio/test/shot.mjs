// usage: node test/shot.mjs <path> <width> <out.png> [full] [scrollY]
import { chromium } from 'playwright';
const [, , p = '/', w = '1440', out = '/tmp/shot.png', full, sy] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: +w, height: +w < 800 ? 800 : 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => !r.url().includes('fonts.g') && errs.push('failed: ' + r.url()));
await page.goto('http://localhost:5173' + p, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
if (sy) { await page.evaluate((y) => window.scrollTo(0, +y), sy); await page.waitForTimeout(1200); }
if (full) { // trigger reveals
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(1200);
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: out, fullPage: !!full });
console.log('overflowX:', overflow, '| errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
