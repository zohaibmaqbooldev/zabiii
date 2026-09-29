// Server-side Gemini endpoint for the admin CMS  —  POST /api/ai
//
// • Runs only on the server (Vercel Function). The Gemini key is read from the
//   GEMINI_API_KEY environment variable and is never sent to the browser,
//   never logged and never included in a response.
// • Admin-only: the caller must send their Supabase session token and be listed
//   in public.admin_users (checked with the existing public.is_admin() function,
//   so the same rules as the database's RLS apply).
// • Inputs are validated and size-limited; each call makes at most one Gemini
//   request (plus one retry on a different model if the first model is missing).

const DEFAULT_SUPABASE_URL = 'https://fectstagqsocxqlecqbb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_aquZZ3NUce9CkFn1rgCRhA_fHrG44pX'; // public key, safe to ship

const MAX_BODY_BYTES = 16_000;
const MAX_TEXT = 4_000;
const MAX_CONTEXT_VALUE = 600;
const MAX_CHAT_MESSAGES = 12;
const GEMINI_TIMEOUT_MS = 30_000;
const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'];

// Result length limits match the admin form fields.
const TASKS = {
  project_short: { limit: 280, label: 'a short project summary for a portfolio card (one or two sentences, max 280 characters)' },
  project_full: { limit: 4000, label: 'a full project description for the project detail page (2–4 short paragraphs separated by blank lines)' },
  bio: { limit: 400, label: 'a short hero introduction / bio written in first person (max 400 characters)' },
  about: { limit: 2000, label: 'an "About me" section written in third person (1–2 short paragraphs)' },
  experience: { limit: 2000, label: 'a description of a work / internship / volunteer role (a short paragraph or 3–5 concise lines)' },
  education: { limit: 1500, label: 'a description of an education entry (1–3 sentences)' },
  certificate_summary: { limit: 500, label: 'a one-to-two sentence summary of a certificate and what it demonstrates' },
  summary: { limit: 600, label: 'a concise summary (2–3 sentences)' },
  improve: { limit: 4000, label: 'an improved version of the text: clearer, more professional, same meaning and similar length' },
  chat: { limit: 4000, label: 'a helpful answer' },
};
const CONTEXT_KEYS = ['title', 'name', 'role', 'technologies', 'category', 'company', 'position', 'institution', 'degree', 'field', 'issuer', 'location', 'focus', 'goal', 'dates', 'notes', 'related'];

const SYSTEM = [
  'You are a writing assistant inside the private admin panel of a personal portfolio website',
  'belonging to Zohaib Maqbool, a BS Computer Science student from Pakistan.',
  'Rules:',
  '- Only use facts given in the request. Never invent employers, clients, dates, numbers, metrics, awards, links or certificates.',
  '- If details are missing, write something accurate but general rather than making things up.',
  '- Professional, warm, confident; no hype words like "revolutionary", no emojis, no hashtags.',
  '- Reply with the final text only: no headings, no markdown, no quotes around it, no preface like "Here is".',
].join('\n');

// --------------------------------------------------------------- helpers ---

const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';
const supabaseUrl = () => (env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
const supabaseKey = () => env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  // Vercel pre-parses JSON bodies (the getter throws on invalid JSON);
  // the local dev server passes a raw stream.
  let pre;
  try {
    pre = req.body;
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body must be valid JSON.');
  }
  if (pre !== undefined && pre !== null) {
    if (typeof pre === 'object' && !Buffer.isBuffer(pre)) {
      if (JSON.stringify(pre).length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Request is too large.');
      return pre;
    }
    const raw = Buffer.isBuffer(pre) ? pre.toString('utf8') : String(pre);
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Request is too large.');
    return parse(raw);
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Request is too large.');
    chunks.push(c);
  }
  return parse(Buffer.concat(chunks).toString('utf8'));
}
function parse(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body must be valid JSON.');
  }
}

async function fetchWithTimeout(url, init, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------------ auth ---

/** Returns the Supabase user id if the bearer token belongs to an admin. */
async function requireAdmin(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  const m = header.match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/);
  if (!m) throw new HttpError(401, 'unauthorized', 'Sign in to use the AI assistant.');
  const token = m[1];
  const base = supabaseUrl();
  const headers = { apikey: supabaseKey(), Authorization: `Bearer ${token}` };

  let userRes;
  try {
    userRes = await fetchWithTimeout(`${base}/auth/v1/user`, { headers }, 10_000);
  } catch {
    throw new HttpError(503, 'auth_unavailable', 'Could not verify your session. Try again.');
  }
  if (userRes.status === 401 || userRes.status === 403) throw new HttpError(401, 'unauthorized', 'Your session has expired. Sign in again.');
  if (!userRes.ok) throw new HttpError(503, 'auth_unavailable', 'Could not verify your session. Try again.');
  const user = await userRes.json().catch(() => null);
  if (!user || !user.id) throw new HttpError(401, 'unauthorized', 'Sign in to use the AI assistant.');

  let adminRes;
  try {
    adminRes = await fetchWithTimeout(`${base}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }, 10_000);
  } catch {
    throw new HttpError(503, 'auth_unavailable', 'Could not verify admin access. Try again.');
  }
  const isAdmin = adminRes.ok ? await adminRes.json().catch(() => false) : false;
  if (isAdmin !== true) throw new HttpError(403, 'forbidden', 'This account is not allowed to use the AI assistant.');
  return user.id;
}

// ----------------------------------------------------------- rate limit ---
// Best effort (per server instance): protects the Gemini quota from runaway clicks.

const hits = new Map();
function rateLimit(userId) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < 60 * 60_000);
  const lastMinute = list.filter((t) => now - t < 60_000).length;
  const perMinute = Number(env('AI_RATE_LIMIT_PER_MIN')) || 10;
  if (lastMinute >= perMinute || list.length >= perMinute * 10) {
    throw new HttpError(429, 'rate_limited', 'Too many AI requests. Wait a minute and try again.');
  }
  list.push(now);
  hits.set(userId, list);
}

// ------------------------------------------------------------- validate ---

function cleanString(v, max, name) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(400, 'invalid_input', `"${name}" must be text.`);
  const s = v.replace(/\u0000/g, '').trim();
  if (s.length > max) throw new HttpError(400, 'invalid_input', `"${name}" is too long (max ${max} characters).`);
  return s;
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_input', 'Invalid request.');
  const task = body.task;
  if (typeof task !== 'string' || !Object.prototype.hasOwnProperty.call(TASKS, task)) {
    throw new HttpError(400, 'invalid_task', 'Unknown AI task.');
  }
  const mode = body.mode === undefined ? 'generate' : body.mode;
  if (mode !== 'generate' && mode !== 'improve') throw new HttpError(400, 'invalid_input', 'Unknown mode.');
  const text = cleanString(body.text, MAX_TEXT, 'text');

  const context = {};
  if (body.context !== undefined && body.context !== null) {
    if (typeof body.context !== 'object' || Array.isArray(body.context)) throw new HttpError(400, 'invalid_input', '"context" must be an object.');
    for (const [k, v] of Object.entries(body.context)) {
      if (!CONTEXT_KEYS.includes(k)) continue; // ignore unknown keys
      const s = cleanString(Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : v, k === 'related' ? 2000 : MAX_CONTEXT_VALUE, k);
      if (s) context[k] = s;
    }
  }

  let messages = [];
  if (task === 'chat') {
    if (!Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, 'invalid_input', 'Send at least one message.');
    if (body.messages.length > MAX_CHAT_MESSAGES) throw new HttpError(400, 'invalid_input', `Too many messages (max ${MAX_CHAT_MESSAGES}).`);
    messages = body.messages.map((m, i) => {
      if (!m || (m.role !== 'user' && m.role !== 'model')) throw new HttpError(400, 'invalid_input', `Message ${i + 1} has an invalid role.`);
      const t = cleanString(m.text, 2000, `messages[${i}].text`);
      if (!t) throw new HttpError(400, 'invalid_input', `Message ${i + 1} is empty.`);
      return { role: m.role, text: t };
    });
    if (messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'invalid_input', 'The last message must be from the user.');
  } else if (mode === 'improve' || task === 'improve' || task === 'summary' || task === 'certificate_summary') {
    if (!text && !(task === 'certificate_summary' && context.title)) {
      throw new HttpError(400, 'empty_input', mode === 'improve' || task === 'improve' ? 'Write some text first, then ask the AI to improve it.' : 'Add some text to summarise first.');
    }
  } else if (!text && Object.keys(context).length === 0) {
    throw new HttpError(400, 'empty_input', 'Add a few details first (for example a title) so the AI has something to work with.');
  }
  return { task, mode, text, context, messages };
}

// --------------------------------------------------------------- prompt ---

function buildPrompt({ task, mode, text, context }) {
  const spec = TASKS[task];
  const lines = [];
  const facts = Object.entries(context).map(([k, v]) => `- ${k}: ${v}`);
  if (mode === 'improve' || task === 'improve') {
    lines.push(`Rewrite the text below as ${task === 'improve' ? 'an improved version' : spec.label}.`);
    lines.push('Keep every fact, fix grammar and flow, make it sound professional. Do not add new facts.');
  } else if (task === 'summary' || task === 'certificate_summary') {
    lines.push(`Write ${spec.label} of the material below.`);
  } else {
    lines.push(`Write ${spec.label}.`);
    if (text) lines.push('Use the current draft below as a starting point.');
  }
  lines.push(`Hard limit: ${spec.limit} characters.`);
  if (facts.length) lines.push('', 'Known details:', ...facts);
  if (text) lines.push('', '"""', text, '"""');
  return lines.join('\n');
}

// --------------------------------------------------------------- gemini ---

function modelList() {
  const custom = env('GEMINI_MODEL').trim();
  const list = custom ? [custom, ...DEFAULT_MODELS] : DEFAULT_MODELS;
  return [...new Set(list)].filter((m) => /^[a-z0-9.\-]{3,60}$/i.test(m));
}

async function callGemini(apiKey, contents, limit) {
  const base = (env('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const models = modelList();
  let lastError = null;
  for (let i = 0; i < models.length && i < 2; i++) {
    const model = models[i];
    const generationConfig = { maxOutputTokens: Math.min(4096, Math.ceil(limit / 2) + 1024) };
    if (/^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    let r;
    try {
      r = await fetchWithTimeout(
        `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig }),
        },
        GEMINI_TIMEOUT_MS,
      );
    } catch (e) {
      const timedOut = e && e.name === 'AbortError';
      throw new HttpError(timedOut ? 504 : 502, timedOut ? 'ai_timeout' : 'ai_unavailable', timedOut ? 'The AI took too long to answer. Try again.' : 'Could not reach Gemini. Try again in a moment.');
    }
    if (r.status === 404) {
      lastError = new HttpError(502, 'ai_model_unavailable', 'The configured Gemini model is not available for this API key.');
      continue; // try the next model once
    }
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const reason = JSON.stringify((json && json.error && json.error.details) || '');
      // Status only — never log headers or the key.
      console.error(`[api/ai] Gemini error ${r.status} (${model})`);
      if (r.status === 400 && /API_KEY_INVALID/.test(reason)) throw new HttpError(502, 'ai_bad_key', 'Gemini rejected the API key. Check GEMINI_API_KEY in your Vercel settings.');
      if (r.status === 401 || r.status === 403) throw new HttpError(502, 'ai_bad_key', 'Gemini rejected the API key. Check GEMINI_API_KEY in your Vercel settings.');
      if (r.status === 429) throw new HttpError(429, 'ai_quota', 'Gemini usage limit reached. Try again later.');
      if (r.status === 400) throw new HttpError(502, 'ai_bad_request', 'Gemini could not process this request.');
      throw new HttpError(502, 'ai_unavailable', 'Gemini is unavailable right now. Try again in a moment.');
    }
    const cand = json && Array.isArray(json.candidates) ? json.candidates[0] : null;
    const parts = (cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : []).filter((p) => typeof p.text === 'string' && !p.thought);
    const out = parts.map((p) => p.text).join('').trim();
    if (!out) {
      const blocked = (json && json.promptFeedback && json.promptFeedback.blockReason) || (cand && cand.finishReason === 'SAFETY');
      throw new HttpError(502, 'ai_empty', blocked ? 'Gemini declined to answer this request.' : 'Gemini returned an empty answer. Try again.');
    }
    return { text: out, model };
  }
  throw lastError || new HttpError(502, 'ai_unavailable', 'Gemini is unavailable right now.');
}

function tidy(text, limit) {
  let t = text
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^(here('| i)s|sure[,!])[^\n]*:\s*\n+/i, '')
    .replace(/^["“](.*)["”]$/s, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length > limit) {
    const cut = t.slice(0, limit);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = (stop > limit * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')).trim();
  }
  return t;
}

// -------------------------------------------------------------- handler ---

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
    }
    const userId = await requireAdmin(req);
    const apiKey = env('GEMINI_API_KEY').trim();

    // GET = status check for the admin panel (never reveals the key itself)
    if (req.method === 'GET') return send(res, 200, { ok: true, configured: Boolean(apiKey), model: modelList()[0] });

    const input = validate(await readJson(req));
    if (!apiKey) throw new HttpError(503, 'not_configured', 'The AI assistant is not set up yet: add GEMINI_API_KEY in Vercel → Settings → Environment Variables, then redeploy.');
    rateLimit(userId);

    const spec = TASKS[input.task];
    const contents =
      input.task === 'chat'
        ? input.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
        : [{ role: 'user', parts: [{ text: buildPrompt(input) }] }];
    const { text, model } = await callGemini(apiKey, contents, spec.limit);
    return send(res, 200, { ok: true, text: tidy(text, spec.limit), model });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { ok: false, code: e.code, error: e.message });
    console.error('[api/ai] unexpected error', e && e.name);
    return send(res, 500, { ok: false, code: 'server_error', error: 'Something went wrong. Try again.' });
  }
}
