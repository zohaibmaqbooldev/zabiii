import { chromium } from 'playwright';
const w = +(process.argv[2] || 1366);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: w, height: 900 } });
await p.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle' });
await p.screenshot({ path: `/tmp/a-login-${w}.png` });
await p.fill('#login-email', 'zohaibmaqbool313@gmail.com'); await p.fill('#login-pass', 'Admin#2026'); await p.click('.login__submit');
await p.waitForURL('**/dashboard'); await p.waitForTimeout(900);
for (const [n, path] of [['dash', '/admin/dashboard'], ['projects', '/admin/projects'], ['form', '/admin/projects/new'], ['skills', '/admin/skills'], ['media', '/admin/media'], ['profile', '/admin/profile'], ['settings', '/admin/settings'], ['contact', '/admin/contact'], ['experience', '/admin/experience']]) {
  await p.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: `/tmp/a-${n}-${w}.png`, fullPage: n === 'form' || n === 'projects' });
  console.log(n, 'overflow', ov);
}
await b.close();
