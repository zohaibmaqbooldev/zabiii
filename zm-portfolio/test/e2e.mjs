// End-to-end test: real browser → built site → local Supabase-compatible gateway → real Postgres (with RLS).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:5173';
const GW = 'http://localhost:54321';
const ADMIN = { email: 'zohaibmaqbool313@gmail.com', password: 'Admin#2026' };
const results = [];
const consoleErrors = [];
let step = '';

const sql = (q) => execFileSync('psql', ['-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', 'portfolio', '-At', '-c', q], { encoding: 'utf8' }).trim();
function ok(name, cond, detail = '') {
  results.push({ name, pass: Boolean(cond), detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const watch = (p, label) => {
  p.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text() + (m.location()?.url || '')) && !(step === 'login errors' && /status of 400/.test(m.text())) && !(['security check', 'session expiry', 'account', 'forgot password', 'log out everywhere'].includes(step) && /status of 4\d\d/.test(m.text())) && consoleErrors.push(`[${label}] ${step}: ${m.text()} ${m.location()?.url || ''}`));
  p.on('pageerror', (e) => consoleErrors.push(`[${label}] ${step}: pageerror ${e.message}`));
};
watch(page, 'admin');

// a separate anonymous visitor
const visitorCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const visitor = await visitorCtx.newPage();
watch(visitor, 'visitor');
async function visit(path) {
  await visitor.evaluate(() => localStorage.clear()).catch(() => {});
  await visitor.goto(BASE + path, { waitUntil: 'networkidle' });
  await visitor.waitForTimeout(400);
}
/** poll until cond() is truthy (DB writes land slightly after the UI toast) */
async function until(cond, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return Boolean(await cond());
}
const text = async (p, sel) => (await p.locator(sel).allInnerTexts()).join('\n');
const toast = async (re) => {
  try {
    await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 8000 });
    return true;
  } catch {
    return false;
  }
};

try {
  // ------------------------------------------------------------------ public
  step = 'public home';
  await visit('/');
  for (const id of ['home', 'about', 'skills', 'work', 'projects', 'education', 'certificates', 'contact']) ok(`public: section #${id} rendered`, await visitor.locator(`#${id}`).count());
  ok('public: hero uses provided profile photo', (await visitor.locator('.portrait img').getAttribute('src')) === '/images/profile-928.webp');
  ok('public: header uses ZM logo', (await visitor.locator('.site-header .logo-mark').getAttribute('src')).includes('zm-mark'));
  ok('public: featured shows starter project with provided image', (await visitor.locator('.feature--lead img').getAttribute('src')).includes('project-dashboard'));
  ok('public: 15 starter skills', (await visitor.locator('.chip').count()) === 15);
  ok('public: certificates empty state', (await text(visitor, '#certificates')).includes('No certificates added yet.'));
  ok('public: no GitHub/Live buttons when URLs empty', (await visitor.locator('.feature a:has-text("View on GitHub"), .feature a:has-text("Live Demo")').count()) === 0);
  ok('whatsapp: floating button uses the number stored in Supabase', (await visitor.locator('.wa-fab').getAttribute('href')) === 'https://wa.me/923456300129');
  ok('whatsapp: opens safely in a new tab with an aria-label', (await visitor.locator('.wa-fab[target=_blank][rel*=noopener][aria-label*="WhatsApp"]').count()) === 1);
  const fabBox = await visitor.locator('.wa-fab').boundingBox();
  ok('whatsapp: fixed bottom-right', fabBox.x > 1366 - 100 && fabBox.y > 900 - 100, JSON.stringify(fabBox));
  ok('experience: section hidden while there are no entries', (await visitor.locator('#experience').count()) === 0 && (await visitor.locator('.site-nav a:has-text("Experience")').count()) === 0);
  ok('public: SEO title', (await visitor.title()) === 'Zohaib Maqbool | BS Computer Science Student');
  ok('public: meta description', ((await visitor.locator('meta[name=description]').getAttribute('content')) || '').startsWith('Zohaib Maqbool is a BS Computer Science student'));
  ok('public: og:image set', (await visitor.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/images/og.jpg'));
  ok('public: one h1', (await visitor.locator('h1').count()) === 1);
  const noAlt = await visitor.locator('img:not([alt])').count();
  ok('public: every <img> has alt', noAlt === 0, `${noAlt} missing`);

  step = 'public search';
  await visitor.fill('.search input', 'portfolio');
  await visitor.waitForTimeout(300);
  ok('public: archive search filters', (await visitor.locator('#projects .card').count()) === 1);
  await visitor.fill('.search input', 'zzzz');
  await visitor.waitForTimeout(300);
  ok('public: archive empty-filter state', (await text(visitor, '#projects')).includes('No projects match'));
  await visitor.click('text=Clear filters');
  await visitor.click('#projects .segmented__btn:has-text("Programming")');
  ok('public: category filter', (await visitor.locator('#projects .card').count()) === 1);

  step = 'project detail';
  await visitor.click('#projects .card__link');
  await visitor.waitForURL('**/projects/student-management-system');
  await visitor.waitForTimeout(500);
  ok('public: project detail page opens', (await text(visitor, 'h1')).includes('Student Management System'));
  ok('public: detail page title updated', (await visitor.title()).startsWith('Student Management System'));
  await visitor.click('text=All projects');
  await visitor.waitForTimeout(700);
  ok('public: back link returns home', new URL(visitor.url()).pathname === '/');
  await visit('/projects/does-not-exist');
  ok('public: unknown project shows 404 state', (await text(visitor, 'main')).includes("isn't available"));

  step = 'mobile nav';
  await visitor.setViewportSize({ width: 390, height: 844 });
  await visit('/');
  const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const mfab = await visitor.locator('.wa-fab').boundingBox();
  ok('whatsapp: visible bottom-right on mobile', mfab && mfab.x + mfab.width <= 390 && mfab.y + mfab.height <= 844 && mfab.x > 300);
  ok('mobile: no horizontal scroll at 390px', overflow === 0, `overflow ${overflow}`);
  await visitor.click('.menu-btn');
  await visitor.waitForTimeout(700);
  ok('mobile: menu opens', await visitor.locator('.site-header.is-open').count());
  await visitor.keyboard.press('Escape');
  await visitor.waitForTimeout(300);
  ok('mobile: Escape closes menu', (await visitor.locator('.site-header.is-open').count()) === 0);
  await visitor.click('.menu-btn');
  await visitor.waitForTimeout(600);
  await visitor.click('.mobile-menu a:has-text("Education")');
  await visitor.waitForTimeout(900);
  ok('mobile: menu link navigates & closes', (await visitor.locator('.site-header.is-open').count()) === 0 && (await visitor.evaluate(() => scrollY)) > 1000);
  await visitor.setViewportSize({ width: 1366, height: 900 });

  // --------------------------------------------------------------- auth
  step = 'auth guard';
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok('auth: /admin/dashboard redirects to login when signed out', new URL(page.url()).pathname === '/admin/login');
  await page.goto(BASE + '/admin/projects', { waitUntil: 'networkidle' });
  ok('auth: /admin/projects redirects to login when signed out', new URL(page.url()).pathname === '/admin/login');

  step = 'login errors';
  await page.fill('#login-email', 'not-an-email');
  await page.fill('#login-pass', 'x');
  await page.click('.login__submit');
  ok('auth: invalid email rejected', (await text(page, '.login__alert')).includes('valid email'));
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', 'wrong-password');
  await page.click('.login__submit');
  await page.waitForSelector('.login__alert');
  ok('auth: wrong password rejected', (await text(page, '.login__alert')).includes('Incorrect email or password'));
  await page.fill('#login-email', 'nobody@nowhere.dev');
  await page.fill('#login-pass', 'whatever1');
  await page.click('.login__submit');
  await page.waitForTimeout(500);
  ok('auth: unknown account rejected', (await text(page, '.login__alert')).includes('Incorrect email or password'));
  await page.fill('#login-email', 'random@test.local');
  await page.fill('#login-pass', 'Random#2026');
  await page.click('.login__submit');
  await page.waitForTimeout(800);
  ok('auth: signed-in non-admin is refused', (await text(page, '.login__alert')).includes('does not have admin access'));

  step = 'login';
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', ADMIN.password);
  await page.click('.login__submit');
  await page.waitForURL('**/admin/dashboard');
  await page.waitForSelector('.stat__value');
  ok('auth: admin login → dashboard', true);
  const stats = await text(page, '.stats');
  ok('dashboard: stats render', /Total projects\s*02/.test(stats) && /Skills\s*15/.test(stats), stats.replace(/\n/g, ' '));

  // ------------------------------------------------------------ projects
  step = 'create project';
  await page.click('a:has-text("Projects") >> nth=0');
  await page.waitForSelector('.prow:not(.prow--head)');
  await page.click('text=Add New Project');
  await page.waitForSelector('#p-title');
  await page.click('button:has-text("Create project")');
  ok('validation: empty form blocked', (await text(page, '.afield__error')).includes('title is required'));
  await page.fill('#p-title', 'E2E Weather App');
  ok('form: slug auto-generated', (await page.inputValue('#p-slug')) === 'e2e-weather-app');
  await page.fill('#p-short', 'A small weather dashboard built to test the CMS end to end.');
  await page.fill('#p-full', 'First paragraph.\n\nSecond paragraph with more detail.');
  await page.fill('#p-tech', 'Python');
  await page.keyboard.press('Enter');
  await page.fill('#p-tech', 'Flask, SQLite');
  await page.keyboard.press('Enter');
  await page.fill('#p-cat', 'Web Development');
  await page.fill('#p-gh', 'not a url');
  await page.fill('#p-live', 'https://weather.example.dev');
  await page.click('button:has-text("Create project")');
  ok('validation: invalid GitHub URL rejected', (await text(page, '.afield__error')).includes('full URL'));
  await page.fill('#p-gh', 'https://github.com/example/weather');
  // bad files first
  await page.setInputFiles('.imgfield input[type=file]', 'test/fixtures/not-image.txt');
  ok('upload: non-image rejected', (await text(page, '.imgfield')).includes('Please choose a JPG'));
  await page.setInputFiles('.imgfield input[type=file]', 'test/fixtures/huge.jpg');
  ok('upload: >10MB rejected', (await text(page, '.imgfield')).includes('limit is 10 MB'));
  await page.setInputFiles('.imgfield input[type=file]', 'test/fixtures/a.jpg');
  ok('upload: image uploaded with progress UI', await toast(/Image uploaded/));
  ok('upload: preview shown', await page.locator('.dropzone.has-image img').count());
  await page.click('button[role=switch]:near(:text("Featured"))');
  await page.click('button:has-text("Create project")');
  ok('create: success toast', await toast(/created and published/));
  await page.waitForURL('**/admin/projects');
  const row = sql("select id||'|'||coalesce(image,'')||'|'||array_to_string(technologies,',')||'|'||featured||'|'||published||'|'||slug from projects where title='E2E Weather App'");
  const [pid, pimg, ptech, pfeat, ppub, pslug] = row.split('|');
  ok('create: row in database', Boolean(pid), row);
  ok('create: technologies saved', ptech === 'Python,Flask,SQLite', ptech);
  ok('create: featured+published saved', pfeat === 'true' && ppub === 'true');
  ok('create: image stored in portfolio-images (lg+sm)', Number(sql(`select count(*) from storage.objects where bucket_id='portfolio-images' and name like 'projects/%'`)) === 2, pimg);
  ok('create: webp conversion', pimg.endsWith('-lg.webp'));
  ok('create: appears in admin list', (await text(page, '.plist')).includes('E2E Weather App'));

  await visit('/');
  ok('public: new project in Featured', (await text(visitor, '#work')).includes('E2E Weather App'));
  ok('public: new project in archive', (await text(visitor, '#projects')).includes('E2E Weather App'));
  await visit('/projects/' + pslug);
  ok('public: detail shows Live Demo + GitHub buttons', (await visitor.locator('.project-hero a:has-text("Live Demo")').count()) === 1 && (await visitor.locator('.project-hero a:has-text("View on GitHub")').count()) === 1);
  ok('public: external links open in new tab safely', (await visitor.locator('.project-hero a[target=_blank][rel*=noopener]').count()) === 2);
  ok('public: full description paragraphs', (await visitor.locator('.project-prose p').count()) === 2);
  ok('public: uploaded image served', (await visitor.locator('.project-visual img').getAttribute('src')) === pimg && (await visitor.locator('.project-visual .smart-img.is-loaded').count()) === 1);
  ok('public: responsive srcset for uploads', ((await visitor.locator('.project-visual img').getAttribute('srcset')) || '').includes('-sm.webp 800w'));

  step = 'edit project';
  await page.goto(`${BASE}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#p-title');
  await page.fill('#p-title', 'E2E Weather Dashboard');
  await page.fill('#p-short', 'Edited short description.');
  await page.click('.tag-input__tag:has-text("SQLite") button');
  await page.fill('#p-tech', 'Chart.js');
  await page.keyboard.press('Enter');
  await page.fill('#p-gh', ''); // remove GitHub link
  await page.click('button:has-text("Save changes")');
  ok('edit: saved toast', await toast(/Changes saved/));
  ok('edit: DB updated', sql(`select title||'|'||short_description||'|'||array_to_string(technologies,',')||'|'||coalesce(github_url,'NULL') from projects where id='${pid}'`) === 'E2E Weather Dashboard|Edited short description.|Python,Flask,Chart.js|NULL');
  await visit('/projects/' + pslug);
  ok('public: edit reflected (title/desc/tech)', (await text(visitor, 'main')).includes('E2E Weather Dashboard') && (await text(visitor, 'main')).includes('Chart.js') && !(await text(visitor, 'main')).includes('SQLite'));
  ok('public: removed GitHub URL hides button', (await visitor.locator('a:has-text("View on GitHub")').count()) === 0);

  step = 'replace image';
  await page.goto(`${BASE}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dropzone.has-image');
  await page.setInputFiles('.imgfield input[type=file]', 'test/fixtures/b.png');
  await toast(/Image uploaded/);
  await page.click('button:has-text("Save changes")');
  await toast(/Changes saved/);
  const newImg = sql(`select image from projects where id='${pid}'`);
  const oldPath = pimg.split('/portfolio-images/')[1];
  ok('replace: new image saved', newImg !== pimg && newImg.endsWith('-lg.webp'));
  ok('replace: old image removed from storage', sql(`select count(*) from storage.objects where name in ('${oldPath}','${oldPath.replace('-lg', '-sm')}')`) === '0');
  ok('replace: only the new pair remains', sql(`select count(*) from storage.objects where name like 'projects/%'`) === '2');
  await visit('/projects/' + pslug);
  ok('public: new image appears', (await visitor.locator('.project-visual img').getAttribute('src')) === newImg && (await visitor.locator('.project-visual .smart-img.is-loaded').count()) === 1);

  step = 'feature/publish';
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  const prow = page.locator('.prow', { hasText: 'E2E Weather Dashboard' });
  await prow.locator('button:has-text("Featured")').click();
  ok('feature: unfeature toast', await toast(/Removed from Featured/));
  await visit('/');
  ok('public: unfeatured project leaves Featured', !(await text(visitor, '#work')).includes('E2E Weather Dashboard') && (await text(visitor, '#projects')).includes('E2E Weather Dashboard'));
  await prow.locator('button:has-text("Not featured")').click();
  await toast(/Added to Featured/);
  await visit('/');
  ok('public: featured again', (await text(visitor, '#work')).includes('E2E Weather Dashboard'));
  await prow.locator('button:has-text("Published")').click();
  ok('publish: unpublish toast', await toast(/Unpublished/));
  await visit('/');
  ok('public: unpublished project hidden everywhere', !(await text(visitor, 'main')).includes('E2E Weather Dashboard'));
  await visit('/projects/' + pslug);
  ok('public: unpublished detail URL not available', (await text(visitor, 'main')).includes("isn't available"));
  const anonRows = await (await fetch(`${GW}/rest/v1/projects?select=id&id=eq.${pid}`, { headers: { apikey: 'sb_publishable_localtestkey' } })).json();
  ok('security: unpublished row not readable via API by visitors', anonRows.length === 0);
  await prow.locator('button:has-text("Hidden")').click();
  await toast(/Published — now live/);

  step = 'reorder';
  const orderBefore = sql(`select string_agg(title, ' > ' order by display_order) from projects`);
  await prow.locator('button[aria-label^="Move"][aria-label$="up"]').click();
  await toast(/Order updated/);
  const orderAfter = sql(`select string_agg(title, ' > ' order by display_order) from projects`);
  ok('reorder: DB order changed', orderBefore !== orderAfter && orderAfter.indexOf('E2E') < orderBefore.indexOf('E2E'), orderAfter);
  await visit('/');
  const cards = await visitor.locator('#projects .card__title').allInnerTexts();
  ok('public: archive order follows admin order', cards.join(' > ') === orderAfter, cards.join(' > '));

  step = 'duplicate';
  await prow.locator('button:has-text("Duplicate")').click();
  ok('duplicate: toast', await toast(/Duplicated as/));
  const dup = sql(`select id||'|'||published||'|'||image from projects where title='E2E Weather Dashboard (copy)'`).split('|');
  ok('duplicate: separate row with its own id', dup[0] && dup[0] !== pid);
  ok('duplicate: starts hidden', dup[1] === 'false');
  const dupRow = page.locator('.prow', { hasText: 'E2E Weather Dashboard (copy)' });
  await dupRow.locator('button:has-text("Delete")').click();
  ok('delete: confirmation dialog shown', (await text(page, 'dialog[open]')).includes('Are you sure you want to delete this project?'));
  await page.click('dialog[open] button:has-text("Cancel")');
  ok('delete: cancel keeps project', sql(`select count(*) from projects where id='${dup[0]}'`) === '1');
  await dupRow.locator('button:has-text("Delete")').click();
  await page.click('dialog[open] button:has-text("Delete Project")');
  ok('delete: toast', await toast(/deleted/));
  ok('delete: duplicate removed from DB', sql(`select count(*) from projects where id='${dup[0]}'`) === '0');
  ok('delete: shared image kept (original still uses it)', sql(`select count(*) from storage.objects where name like 'projects/%'`) === '2');
  ok('delete: list updated without refresh', !(await text(page, '.plist')).includes('(copy)'));

  step = 'delete project';
  await prow.locator('button:has-text("Delete")').click();
  await page.click('dialog[open] button:has-text("Delete Project")');
  await toast(/deleted/);
  ok('delete: project removed from DB', await until(() => sql(`select count(*) from projects where id='${pid}'`) === '0'));
  ok('delete: its image removed from storage', await until(() => sql(`select count(*) from storage.objects where name like 'projects/%'`) === '0'));
  await visit('/');
  ok('public: deleted project gone', !(await text(visitor, 'main')).includes('E2E Weather'));

  // -------------------------------------------------------------- skills
  step = 'skills';
  await page.goto(`${BASE}/admin/skills`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.crow');
  await page.click('button:has-text("Add skill")');
  await page.fill('#s-name', 'Rust');
  await page.fill('#s-cat', 'Languages');
  await page.selectOption('#s-prof', '2');
  await page.click('dialog[open] button:has-text("Save")');
  ok('skills: add', await toast(/Skill added/));
  const srow = page.locator('.crow', { hasText: 'Rust' });
  await srow.locator('button:has-text("Edit")').click();
  await page.fill('#s-name', 'Rust Lang');
  await page.fill('#s-cat', 'Systems');
  await page.selectOption('#s-prof', '4');
  await page.click('dialog[open] button:has-text("Save")');
  ok('skills: edit', await toast(/Skill updated/));
  ok('skills: DB has new category + proficiency', sql(`select category||proficiency from skills where name='Rust Lang'`) === 'Systems4');
  await visit('/');
  ok('public: new skill category & level', (await text(visitor, '#skills')).includes('Systems') && (await visitor.locator('.chip:has-text("Rust Lang") .level .on').count()) === 4);
  const before = sql(`select name from skills order by display_order desc limit 1`);
  await page.locator('.crow', { hasText: 'Rust Lang' }).locator('button[aria-label$="up"]').click();
  await page.waitForTimeout(600);
  ok('skills: reorder', sql(`select name from skills order by display_order desc limit 1`) !== before);
  await page.locator('.crow', { hasText: 'Rust Lang' }).locator('button:has-text("Visible")').click();
  await toast(/hidden from the site/);
  await visit('/');
  ok('public: hidden skill not shown', !(await text(visitor, '#skills')).includes('Rust Lang'));
  await page.locator('.crow', { hasText: 'Rust Lang' }).locator('button[aria-label^="Delete"]').click();
  await page.click('dialog[open] button:has-text("Delete")');
  ok('skills: delete', await toast(/Skill deleted/));
  ok('skills: gone from DB', sql(`select count(*) from skills where name='Rust Lang'`) === '0');

  // ----------------------------------------------------------- education
  step = 'education';
  await page.goto(`${BASE}/admin/education`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.crow');
  await page.click('button:has-text("Add education entry")');
  await page.fill('#e-degree', 'Intermediate (FSc Pre-Engineering)');
  await page.fill('#e-start', '2021');
  await page.fill('#e-end', '2023');
  await page.click('dialog[open] button:has-text("Save")');
  ok('education: add', await toast(/added/));
  await page.locator('.crow', { hasText: 'Intermediate' }).locator('button:has-text("Edit")').click();
  await page.fill('#e-inst', 'Test College');
  await page.click('dialog[open] button:has-text("Save")');
  ok('education: edit', await toast(/updated/));
  await page.locator('.crow', { hasText: 'Intermediate' }).locator('button[aria-label$="up"]').click();
  await page.waitForTimeout(600);
  ok('education: reorder', sql(`select degree from education order by display_order limit 1`).startsWith('Intermediate'));
  await visit('/');
  const edu = await visitor.locator('.tl-item__title').allInnerTexts();
  ok('public: education order + edit', edu[0].startsWith('Intermediate') && (await text(visitor, '#education')).includes('Test College'), edu.join(' | '));
  await page.locator('.crow', { hasText: 'Intermediate' }).locator('button[aria-label^="Delete"]').click();
  await page.click('dialog[open] button:has-text("Delete")');
  ok('education: delete', await toast(/deleted/));
  await visit('/');
  ok('public: education delete reflected', !(await text(visitor, '#education')).includes('Intermediate'));

  // --------------------------------------------------------- certificates
  step = 'certificates';
  await page.goto(`${BASE}/admin/certificates`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=No certificates added yet.');
  for (const t of ['Cert One', 'Cert Two']) {
    await page.click('button:has-text("Add certificate") >> nth=0');
    await page.fill('#c-title', t);
    await page.fill('#c-issuer', 'Test Issuer');
    await page.fill('#c-date', '2026-05-01');
    await page.fill('#c-url', 'https://example.org/verify/' + t.replace(' ', ''));
    if (t === 'Cert One') {
      await page.setInputFiles('dialog[open] .imgfield input[type=file]', 'test/fixtures/a.jpg');
      await toast(/Image uploaded/);
    }
    await page.click('dialog[open] button:has-text("Save")');
    await toast(/Certificate added/);
  }
  ok('certs: two added (one with image)', await until(() => sql(`select count(*) from certificates`) === '2' && sql(`select count(*) from storage.objects where name like 'certificates/%'`) === '2'));
  const certOld = sql(`select image from certificates where title='Cert One'`);
  await page.locator('.crow', { hasText: 'Cert One' }).locator('button:has-text("Edit")').click();
  await page.setInputFiles('dialog[open] .imgfield input[type=file]', 'test/fixtures/b.png');
  await toast(/Image uploaded/);
  await page.fill('#c-title', 'Cert One (renewed)');
  await page.click('dialog[open] button:has-text("Save")');
  await toast(/Certificate updated/);
  const certNew = sql(`select image from certificates where title='Cert One (renewed)'`);
  ok('certs: image replaced, old file deleted', certNew !== certOld && sql(`select count(*) from storage.objects where name like 'certificates/%'`) === '2');
  await page.locator('.crow', { hasText: 'Cert Two' }).locator('button[aria-label$="up"]').click();
  await page.waitForTimeout(600);
  await visit('/');
  const certTitles = await visitor.locator('.cert__title').allInnerTexts();
  ok('public: certificates gallery + order', certTitles.join('|') === 'Cert Two|Cert One (renewed)', certTitles.join('|'));
  ok('public: credential link', (await visitor.locator('.cert__link').count()) === 2);
  ok('public: certificate without image shows fallback (no broken img)', (await visitor.locator('.cert .smart-img.is-error').count()) === 1);
  await visitor.click('.cert__media:not([disabled])');
  await visitor.waitForTimeout(400);
  ok('public: certificate lightbox opens', await visitor.locator('dialog[open]').count());
  await visitor.keyboard.press('Escape');
  await visitor.waitForTimeout(300);
  ok('public: lightbox closes with Escape', (await visitor.locator('dialog[open]').count()) === 0);
  for (const t of ['Cert Two', 'Cert One (renewed)']) {
    await page.locator('.crow', { hasText: t }).locator('button[aria-label^="Delete"]').click();
    await page.click('dialog[open] button:has-text("Delete")');
    await toast(/Certificate deleted/);
  }
  ok('certs: deleted with their images', await until(() => sql(`select count(*) from certificates`) === '0' && sql(`select count(*) from storage.objects where name like 'certificates/%'`) === '0'));

  // -------------------------------------------------------------- profile
  step = 'profile';
  await page.goto(`${BASE}/admin/profile`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#pf-name');
  await page.fill('#pf-name', 'Zohaib Maqbool Test');
  await page.fill('#pf-title', 'CS Student (test)');
  await page.fill('#pf-bio', 'Edited bio from the E2E test.');
  await page.fill('#pf-email', 'bad-email');
  await page.click('button:has-text("Save profile")');
  ok('profile: invalid email rejected', (await text(page, '.afield__error')).includes('valid email'));
  await page.fill('#pf-email', 'test@example.com');
  await page.fill('#pf-phone', '+92 300 0000000');
  await page.fill('#pf-whatsapp', '+92 300 0000000');
  await page.fill('#pf-location', 'Lahore, Pakistan');
  await page.fill('#pf-github', 'https://github.com/example');
  await page.fill('#pf-linkedin', 'https://www.linkedin.com/in/example');
  await page.setInputFiles('.form-col--side .imgfield >> nth=0 >> input[type=file]', 'test/fixtures/portrait.jpg');
  await toast(/Image uploaded/);
  await page.click('button:has-text("Save profile")');
  ok('profile: saved', await toast(/Profile saved/));
  const prof = sql(`select name||'|'||profile_image from profiles`);
  ok('profile: DB updated', prof.startsWith('Zohaib Maqbool Test|') && prof.includes('/profile/'), prof);
  await visit('/');
  const heroTxt = await text(visitor, '#home');
  ok('public: name/bio updated', heroTxt.includes('Maqbool Test') && heroTxt.includes('Edited bio from the E2E test.'));
  ok('public: profile photo replaced', ((await visitor.locator('.portrait img').getAttribute('src')) || '').includes('/profile/'));
  ok('public: WhatsApp floating button uses number', (await visitor.locator('.wa-fab').getAttribute('href')).startsWith('https://wa.me/923000000000'));
  ok('public: header GitHub/LinkedIn links', (await visitor.locator('.site-header__end a[href="https://github.com/example"]').count()) === 1 && (await visitor.locator('.site-header__end a[href="https://www.linkedin.com/in/example"]').count()) === 1);
  const contact = await text(visitor, '#contact');
  ok('public: contact rows (email/phone/whatsapp/location)', ['test@example.com', '+92 300 0000000', 'Lahore, Pakistan'].every((s) => contact.includes(s)));
  ok('public: contact form enabled (mailto)', await visitor.locator('.contact-form__submit:not([disabled])').count());


  // ----------------------------------------------------------- experience
  step = 'experience';
  await page.goto(`${BASE}/admin/experience`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=No experience added yet.');
  for (const [pos, co] of [['Web Intern', 'Acme Test Co'], ['Volunteer Tutor', 'Test Foundation']]) {
    await page.click('button:has-text("Add experience") >> nth=0');
    await page.fill('#x-pos', pos);
    await page.fill('#x-co', co);
    await page.fill('#x-start', 'Jun 2026');
    await page.fill('#x-url', co === 'Acme Test Co' ? 'https://acme.example' : '');
    await page.fill('#x-tech', 'React');
    await page.keyboard.press('Enter');
    await page.click('dialog[open] button:has-text("Save")');
    await toast(/Experience added/);
  }
  ok('experience: add (2 rows in DB)', await until(() => sql(`select count(*) from experience`) === '2'));
  await page.locator('.crow', { hasText: 'Web Intern' }).locator('button:has-text("Edit")').click();
  await page.fill('#x-pos', 'Web Development Intern');
  await page.click('dialog[open] button:has-text("Save")');
  ok('experience: edit', await toast(/Experience updated/));
  await page.locator('.crow', { hasText: 'Volunteer Tutor' }).locator('button[aria-label$="up"]').click();
  await page.waitForTimeout(600);
  ok('experience: reorder', sql(`select position from experience order by display_order limit 1`) === 'Volunteer Tutor');
  await visit('/');
  ok('public: experience section + nav appear', (await visitor.locator('#experience .tl-item__title').allInnerTexts()).join('|') === 'Volunteer Tutor|Web Development Intern' && (await visitor.locator('.site-nav a:has-text("Experience")').count()) === 1);
  ok('public: section numbers shift after Experience', (await text(visitor, '#education .section-head__rule')).includes('(06)'));
  await page.locator('.crow', { hasText: 'Volunteer Tutor' }).locator('button:has-text("Visible")').click();
  await toast(/hidden from the site/);
  await visit('/');
  ok('public: hidden experience not shown', !(await text(visitor, 'main')).includes('Volunteer Tutor') && (await text(visitor, 'main')).includes('Web Development Intern'));
  for (const t of ['Volunteer Tutor', 'Web Development Intern']) {
    await page.locator('.crow', { hasText: t }).locator('button[aria-label^="Delete"]').click();
    ok(`experience: delete confirmation (${t})`, (await text(page, 'dialog[open]')).includes('Are you sure you want to delete this?'));
    await page.click('dialog[open] button:has-text("Delete")');
    await toast(/Experience deleted/);
  }
  ok('experience: deleted', await until(() => sql(`select count(*) from experience`) === '0'));
  await visit('/');
  ok('public: experience section gone again', (await visitor.locator('#experience').count()) === 0);

  // -------------------------------------------------------------- contact
  step = 'contact';
  await page.goto(`${BASE}/admin/contact`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#ct-wa');
  ok('contact: shows the WhatsApp number stored in Supabase', (await page.inputValue('#ct-wa')) === sql(`select whatsapp from profiles`));
  await page.fill('#ct-wa', '123');
  await page.click('button:has-text("Save contact info")');
  ok('contact: invalid WhatsApp rejected', (await text(page, '.afield__error')).includes('country code'));
  await page.fill('#ct-wa', '+92 300 1112223');
  await page.click('button:has-text("Save contact info")');
  ok('contact: saved', await toast(/Contact information saved/));
  await visit('/');
  ok('public: WhatsApp button follows the new number', (await visitor.locator('.wa-fab').getAttribute('href')) === 'https://wa.me/923001112223');
  await page.fill('#ct-wa', '+923456300129');
  await page.click('button:has-text("Save contact info")');
  await toast(/Contact information saved/);
  await visit('/');
  ok('public: WhatsApp restored to +923456300129', (await visitor.locator('.wa-fab').getAttribute('href')) === 'https://wa.me/923456300129');

  // --------------------------------------------------------------- social
  step = 'social';
  await page.goto(`${BASE}/admin/social`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Add link") >> nth=0');
  await page.fill('#sl-platform', 'Instagram');
  await page.fill('#sl-url', 'https://instagram.com/example');
  await page.click('dialog[open] button:has-text("Save")');
  ok('social: add', await toast(/Link added/));
  await visit('/');
  ok('public: social link in footer + contact', (await visitor.locator('.site-footer a[href="https://instagram.com/example"]').count()) === 1 && (await text(visitor, '#contact')).includes('instagram.com/example'));
  await page.locator('.crow', { hasText: 'Instagram' }).locator('button:has-text("Edit")').click();
  await page.fill('#sl-url', 'https://instagram.com/example2');
  await page.click('dialog[open] button:has-text("Save")');
  ok('social: edit', await toast(/Link updated/));
  await page.locator('.crow', { hasText: 'Instagram' }).locator('button[aria-label^="Delete"]').click();
  await page.click('dialog[open] button:has-text("Delete")');
  ok('social: delete', await toast(/Link deleted/));
  await visit('/');
  ok('public: deleted social link gone', (await visitor.locator('a[href*="instagram.com"]').count()) === 0);

  // ---------------------------------------------------------------- media
  step = 'media';
  await page.goto(`${BASE}/admin/media`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.media-card');
  ok('media: lists uploaded profile image as in use', (await text(page, '.media-grid >> nth=1')).includes('In use: Profile photo'));
  ok('media: in-use image cannot be deleted', await page.locator('.media-card', { hasText: 'Profile photo' }).locator('button.danger[disabled]').count());
  await page.setInputFiles('input[type=file] >> nth=0', 'test/fixtures/b.png');
  await toast(/uploaded to portfolio-images/);
  await page.waitForTimeout(500);
  const unused = page.locator('.media-card', { hasText: 'Unused' }).first();
  await unused.locator('button.danger').click();
  await page.click('dialog[open] button:has-text("Delete")');
  ok('media: unused upload deleted', await toast(/Image deleted/));
  ok('media: provided images copied into storage', await (async () => {
    await page.click('button:has-text("Copy into Supabase Storage")');
    return toast(/copied to Supabase Storage/);
  })());
  ok('media: provided images now stored & referenced', sql(`select count(*) from storage.objects where name like 'provided/%'`) === '8' && sql(`select count(*) from projects where image like '%/provided/%'`) === '2' && sql(`select logo_url like '%/provided/%' from profiles`) === 't');
  await visit('/');
  ok('public: logo & starter project images now served from storage', ((await visitor.locator('.site-header .logo-mark').getAttribute('src')) || '').includes('/provided/') && ((await visitor.locator('.feature--lead img').getAttribute('src')) || '').includes('/provided/'));

  // ------------------------------------------------------------- security
  step = 'security check';
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Run security check")');
  await page.waitForSelector('.checks:not(.checks--static) li');
  ok('security: in-app check all green', (await page.locator('.checks li.bad').count()) === 0 && (await page.locator('.checks li.ok').count()) === 9);


  // --------------------------------------------------- account & password
  step = 'account';
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kv--grid');
  const acc = await text(page, '.kv--grid');
  ok('account: shows admin email, status and last login', acc.includes(ADMIN.email) && acc.includes('Active') && !acc.includes('Last login\n—'));
  ok('account: password never displayed', !(await page.content()).includes(ADMIN.password));
  await page.fill('#pw-cur', 'wrong-current');
  await page.fill('#pw-a', 'NewPass2026x');
  await page.fill('#pw-b', 'NewPass2026x');
  await page.click('button:has-text("Change password")');
  await page.waitForSelector('.afield__error');
  ok('password: wrong current password rejected', (await text(page, '.afield__error')).includes('current password is incorrect'));
  await page.fill('#pw-cur', ADMIN.password);
  await page.fill('#pw-b', 'Mismatch2026x');
  await page.click('button:has-text("Change password")');
  ok('password: mismatch rejected', (await text(page, '.afield__error')).includes('do not match'));
  await page.fill('#pw-b', 'NewPass2026x');
  await page.click('button:has-text("Change password")');
  ok('password: changed', await toast(/Password changed/));
  await page.click('.admin-top__actions button:has-text("Logout")');
  await page.waitForURL('**/admin/login');
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', ADMIN.password);
  await page.click('.login__submit');
  await page.waitForSelector('.login__alert');
  ok('password: old password no longer works', (await text(page, '.login__alert')).includes('Incorrect'));
  await page.fill('#login-pass', 'NewPass2026x');
  await page.click('.login__submit');
  await page.waitForURL('**/admin/dashboard');
  ok('password: new password works', true);

  step = 'email change';
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#em-new');
  await page.fill('#em-new', 'not-an-email');
  await page.click('button:has-text("Change email")');
  ok('email: invalid rejected', (await text(page, '.afield__error')).includes('valid email'));
  await page.fill('#em-new', 'zohaib.new@example.com');
  await page.fill('#em-pw', 'NewPass2026x');
  await page.click('button:has-text("Change email")');
  await page.waitForSelector('text=for the confirmation link');
  ok('email: change requested, confirmation pending', await until(async () => (await text(page, '.kv--grid')).includes('zohaib.new@example.com')));

  step = 'forgot password';
  await page.click('.admin-top__actions button:has-text("Logout")');
  await page.waitForURL('**/admin/login');
  await page.click('text=Forgot password?');
  await page.waitForURL('**/admin/forgot-password');
  await page.fill('#fp-email', 'nobody@nowhere.dev');
  await page.click('button:has-text("Send reset link")');
  await page.waitForSelector('text=If an admin account exists');
  ok('forgot: unknown email gets the same neutral message', (await text(page, '.login__card')).includes('If an admin account exists'));
  await page.goto(`${BASE}/admin/forgot-password`, { waitUntil: 'networkidle' });
  await page.fill('#fp-email', ADMIN.email);
  await page.click('button:has-text("Send reset link")');
  await page.waitForSelector('text=If an admin account exists');
  const { link } = await (await fetch(GW + '/__recovery')).json();
  ok('forgot: Supabase recovery email issued with a link back to /admin/reset-password', Boolean(link) && link.includes('/admin/reset-password#access_token='));
  await page.goto(link, { waitUntil: 'networkidle' });
  await page.waitForSelector('#rp-a');
  ok('reset: tokens removed from the address bar', !page.url().includes('access_token'));
  await page.fill('#rp-a', 'short');
  await page.fill('#rp-b', 'short');
  await page.click('button:has-text("Set new password")');
  ok('reset: weak password rejected', (await text(page, '.login__alert')).includes('at least 8'));
  await page.fill('#rp-a', ADMIN.password.replace('#', 'x'));
  await page.fill('#rp-b', ADMIN.password.replace('#', 'x'));
  await page.click('button:has-text("Set new password")');
  await page.waitForURL('**/admin/login', { timeout: 8000 });
  ok('reset: password set, sent to sign in', true);
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', ADMIN.password.replace('#', 'x'));
  await page.click('.login__submit');
  await page.waitForURL('**/admin/dashboard');
  ok('reset: new password works', true);
  await page.goto(`${BASE}/admin/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: 'networkidle' });
  ok('reset: expired link explained', (await text(page, '.login__card')).includes('expired'));
  // restore the original password for the remaining tests
  sql(`update auth.users set encrypted_password = crypt('${ADMIN.password}', gen_salt('bf')) where email='${ADMIN.email}'`);

  step = 'log out everywhere';
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (new URL(page.url()).pathname === '/admin/login') {
    await page.fill('#login-email', ADMIN.email);
    await page.fill('#login-pass', ADMIN.password);
    await page.click('.login__submit');
    await page.waitForURL('**/admin/dashboard');
    await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  }
  const other = await ctx.browser().newContext();
  const p2 = await other.newPage();
  await p2.goto(`${BASE}/admin/login`);
  await p2.fill('#login-email', ADMIN.email);
  await p2.fill('#login-pass', ADMIN.password);
  await p2.click('.login__submit');
  await p2.waitForURL('**/admin/dashboard');
  await page.click('button:has-text("Log out everywhere")');
  await page.click('dialog[open] button:has-text("Log out everywhere")');
  await page.waitForURL('**/admin/login');
  await p2.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  ok('session: "log out everywhere" also ends other devices', new URL(p2.url()).pathname === '/admin/login');
  await other.close();
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', ADMIN.password);
  await page.click('.login__submit');
  await page.waitForURL('**/admin/dashboard');

  // --------------------------------------------------- session expiration
  step = 'session expiry';
  await fetch(GW + '/__expire');
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ok('auth: expired session → login with message', new URL(page.url()).pathname === '/admin/login' && (await text(page, '.login__card')).includes('expired'));

  step = 'logout';
  await page.fill('#login-email', ADMIN.email);
  await page.fill('#login-pass', ADMIN.password);
  await page.click('.login__submit');
  await page.waitForURL('**/admin/dashboard');
  await page.click('button[aria-label="Sign out"]');
  await page.waitForURL('**/admin/login');
  ok('auth: logout returns to login', true);
  ok('auth: session removed from storage', (await page.evaluate(() => localStorage.getItem('zm-admin-session'))) === null);
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('auth: dashboard blocked after logout', new URL(page.url()).pathname === '/admin/login');
} catch (e) {
  ok(`UNCAUGHT in step "${step}"`, false, e.message.split('\n')[0]);
  await page.screenshot({ path: '/tmp/e2e-fail-admin.png' }).catch(() => {});
  await visitor.screenshot({ path: '/tmp/e2e-fail-visitor.png' }).catch(() => {});
}

ok('console: no errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 8).join(' || '));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
