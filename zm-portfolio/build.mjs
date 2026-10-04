// Build / dev server for the portfolio. Zero config beyond .env:
//   npm run build    → production bundle in dist/
//   npm run dev      → rebuild on change + local server on http://localhost:5173
//   npm run preview  → serve the existing dist/
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const serve = args.has('--serve');
const previewOnly = args.has('--preview');
const port = Number(process.env.PORT || 5173);

function loadEnv() {
  const env = {};
  for (const file of process.env.ENV_FILE ? [process.env.ENV_FILE] : ['.env', '.env.local']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...env, ...process.env };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'index.html') continue;
    const s = path.join(from, entry.name), d = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

async function build() {
  const env = loadEnv();
  // Public values (safe to ship) used when the host has no env vars set.
  // Accepts Vite-style or Next.js-style names (both are public values).
  const url = (env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://wkdcjfqpbzyvkrkgokos.supabase.co').trim().replace(/\/+$/, '');
  const key = (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_swFz_q6Yv-dioEsC5GIPdw_K7Mi1K01').trim();
  if (/^sb_secret_/.test(key)) throw new Error('The Supabase key for the browser is a SECRET key. Use the publishable/anon key.');
  if (/service_role/.test(Buffer.from((key.split('.')[1] || ''), 'base64').toString())) {
    throw new Error('VITE_SUPABASE_ANON_KEY is a service_role key. Never ship that — use the anon/publishable key.');
  }
  const hostUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.URL || '';
  const siteUrl = (env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || hostUrl).replace(/\/+$/, '');

  fs.rmSync(dist, { recursive: true, force: true });
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.tsx'), path.join(root, 'src/styles/admin.css')],
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: path.join(dist, 'assets'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    assetNames: '[name]-[hash]',
    minify: !serve,
    sourcemap: serve ? 'inline' : false,
    target: ['es2020', 'chrome90', 'safari15', 'firefox90'],
    jsx: 'automatic',
    metafile: true,
    legalComments: 'none',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
      'import.meta.env.DEV': JSON.stringify(serve),
      'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
    },
    loader: { '.webp': 'file', '.png': 'file', '.svg': 'file' },
    logLevel: 'warning',
  });

  const outputs = Object.entries(result.metafile.outputs);
  const [entryJs] = outputs.find(([, o]) => o.entryPoint && o.entryPoint.endsWith('main.tsx'));
  const entryCss = outputs.find(([f]) => f.endsWith('.css') && f.includes('main-'));
  const adminCss = outputs.find(([, o]) => o.entryPoint && o.entryPoint.endsWith('admin.css'));
  const rel = (f) => '/' + path.relative(dist, path.join(root, f)).split(path.sep).join('/');

  copyDir(path.join(root, 'public'), dist);
  let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  // preload the entry's static imports so they download in parallel, not as a waterfall
  const staticDeps = result.metafile.outputs[entryJs].imports.filter((i) => i.kind === 'import-statement').map((i) => i.path);
  const tags = [
    entryCss ? `<link rel="stylesheet" href="${rel(entryCss[0])}">` : '',
    ...staticDeps.map((d) => `<link rel="modulepreload" href="${rel(d)}">`),
    `<script type="module" src="${rel(entryJs)}"></script>`,
    adminCss ? `<meta name="zm-admin-css" content="${rel(adminCss[0])}">` : '',
  ].join('\n    ');
  html = html.replace('<!--app-assets-->', tags).replaceAll('%SITE_URL%', siteUrl);
  if (url) html = html.replace('<!--supabase-preconnect-->', `<link rel="preconnect" href="${url}" crossorigin>`);
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  // Static hosts: serve index.html for unknown paths (GitHub Pages uses 404.html)
  fs.writeFileSync(path.join(dist, '404.html'), html);

  const kb = (f) => (fs.statSync(path.join(root, f)).size / 1024).toFixed(1) + ' kB';
  console.log(`Supabase: ${new URL(url).host}`);
  console.log(`built ${new Date().toLocaleTimeString()}  entry ${kb(entryJs)}${entryCss ? ', css ' + kb(entryCss[0]) : ''}`);
  if (!url || !key) console.warn('⚠  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env — the site will show its offline state.');
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function startServer() {
  // Server-only secrets (GEMINI_API_KEY) from .env / .env.local for the local API route.
  // They stay in this Node process and are never passed to the browser bundle.
  for (const [k, v] of Object.entries(loadEnv())) if (process.env[k] === undefined) process.env[k] = v;
  http.createServer(async (req, res) => {
    const clean = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (clean === '/api/ai' || clean === '/api/chat') {
      const { default: handler } = await import(`./api${clean.slice(4)}.js`);
      return handler(req, res);
    }
    let file = path.join(dist, clean);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`→ http://localhost:${port}`));
}

if (previewOnly) startServer();
else {
  await build();
  if (serve) {
    startServer();
    let timer;
    fs.watch(path.join(root, 'src'), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
    });
  }
}
