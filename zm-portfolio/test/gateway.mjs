// Local stand-in for the Supabase HTTP API (Auth + PostgREST + Storage subset) on top of a
// REAL Postgres running supabase/setup.sql. Every request runs as the anon or authenticated
// role with JWT claims set, so row-level-security and storage policies are genuinely enforced.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.env.GW_PORT || 54321);
const TTL = Number(process.env.TOKEN_TTL || 3600);
const PSQL = ['-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', 'portfolio', '-At', '-q', '-v', 'ON_ERROR_STOP=1'];
const STORE = path.resolve('test/.storage');
fs.mkdirSync(STORE, { recursive: true });
const LOG = [];

const sqlLit = (v) => {
  const tag = '$z' + crypto.randomBytes(4).toString('hex') + '$';
  return tag + String(v) + tag;
};
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error('bad identifier ' + s), { status: 400 });
  return s;
};

function psql(sql) {
  try {
    return { out: execFileSync('psql', PSQL, { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() };
  } catch (e) {
    const msg = String(e.stderr || e.message).replace(/^.*ERROR:\s*/s, '').split('\n')[0];
    return { err: msg };
  }
}

function runAs(claims, stmt) {
  const role = claims ? 'authenticated' : 'anon';
  return psql(`begin;
set local role ${role};
select set_config('request.jwt.claims', ${sqlLit(JSON.stringify(claims || { role: 'anon' }))}, true) \\g /dev/null
${stmt};
commit;`);
}

function pgError(err, claims) {
  let code = 'XX000', status = 400;
  if (/permission denied|row-level security/.test(err)) { code = '42501'; status = claims ? 403 : 401; }
  else if (/duplicate key/.test(err)) { code = '23505'; status = 409; }
  else if (/relation .* does not exist/.test(err)) { code = '42P01'; status = 404; }
  else if (/column .* does not exist/.test(err)) { code = '42703'; status = 400; }
  else if (/null value in column/.test(err)) { code = '23502'; status = 400; }
  return { status, body: { code, message: err, details: null, hint: null } };
}

// ------------------------------------------------------------------ auth
const tokens = new Map(); // access -> {sub,email,exp}
const lastSignIn = new Map();
const pendingEmail = new Map();
let lastRecovery = null;
const refresh = new Map(); // refresh -> {sub,email}
function issue(user) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const payload = { sub: user.id, email: user.email, role: 'authenticated', exp };
  const access = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + crypto.randomBytes(8).toString('hex');
  const rt = crypto.randomBytes(12).toString('hex');
  tokens.set(access, payload);
  refresh.set(rt, user);
  return { access_token: access, token_type: 'bearer', expires_in: TTL, expires_at: exp, refresh_token: rt, user: { id: user.id, email: user.email } };
}
function claimsFrom(req) {
  const h = req.headers.authorization || '';
  const t = h.replace(/^Bearer\s+/i, '');
  if (!t || t === process.env.ANON_KEY) return { claims: null };
  const c = tokens.get(t);
  if (!c) return { error: 'invalid JWT' };
  if (c.exp < Date.now() / 1000) return { error: 'JWT expired' };
  return { claims: c };
}

// ------------------------------------------------------------------ rest
function whereClause(params) {
  const conds = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const col = ident(k);
    const m = v.match(/^(not\.)?(eq|neq|like|ilike|is|gt|lt|gte|lte)\.(.*)$/s);
    if (!m) throw Object.assign(new Error('unsupported filter ' + v), { status: 400 });
    const [, not, op, raw] = m;
    let c;
    if (op === 'is') c = `${col} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`;
    else if (op === 'like' || op === 'ilike') c = `${col}::text ${op} ${sqlLit(raw.replace(/\*/g, '%'))}`;
    else c = `${col}::text ${{ eq: '=', neq: '<>', gt: '>', lt: '<', gte: '>=', lte: '<=' }[op]} ${sqlLit(raw)}`;
    conds.push(not ? `not (${c})` : c);
  }
  return conds.length ? 'where ' + conds.join(' and ') : '';
}
function orderClause(o) {
  if (!o) return '';
  return 'order by ' + o.split(',').map((part) => {
    const [col, dir = 'asc', nulls] = part.split('.');
    return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`;
  }).join(', ');
}
const selectCols = (s) => (!s || s === '*' ? '*' : s.split(',').map(ident).join(','));

function restHandler(req, res, table, url, body, claims) {
  table = ident(table);
  const p = url.searchParams;
  const cols = selectCols(p.get('select'));
  let stmt;
  if (req.method === 'GET') {
    stmt = `select coalesce(json_agg(t), '[]') from (select ${cols} from public.${table} ${whereClause(p)} ${orderClause(p.get('order'))} ${p.get('limit') ? 'limit ' + Number(p.get('limit')) : ''}) t`;
  } else if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(ident);
    stmt = `with ins as (insert into public.${table} (${keys.join(',')}) select ${keys.join(',')} from json_populate_recordset(null::public.${table}, ${sqlLit(JSON.stringify(rows))}) returning *) select coalesce(json_agg(t), '[]') from (select ${cols} from ins) t`;
  } else if (req.method === 'PATCH') {
    const keys = Object.keys(body).map(ident);
    stmt = `with upd as (update public.${table} set (${keys.join(',')}) = (select ${keys.join(',')} from json_populate_record(null::public.${table}, ${sqlLit(JSON.stringify(body))})) ${whereClause(p)} returning *) select coalesce(json_agg(t), '[]') from (select ${cols} from upd) t`;
    if (keys.length === 1) stmt = stmt.replace(`set (${keys[0]}) = (select ${keys[0]} from`, `set ${keys[0]} = (select ${keys[0]} from`);
  } else if (req.method === 'DELETE') {
    stmt = `with del as (delete from public.${table} ${whereClause(p)} returning *) select coalesce(json_agg(t), '[]') from (select ${cols} from del) t`;
  }
  const r = runAs(claims, stmt);
  if (r.err) {
    const e = pgError(r.err, claims);
    return send(res, e.status, e.body);
  }
  send(res, req.method === 'POST' ? 201 : 200, JSON.parse(r.out || '[]'));
}

// --------------------------------------------------------------- storage
function storageHandler(req, res, rest, url, raw, claims) {
  const [op, ...parts] = rest.split('/');
  if (req.method === 'GET' && op === 'public') {
    const [bucket, ...p] = parts;
    const name = decodeURIComponent(p.join('/'));
    const pub = psql(`select public from storage.buckets where id=${sqlLit(bucket)}`).out;
    const file = path.join(STORE, bucket, name);
    if (pub !== 't' || !file.startsWith(STORE) || !fs.existsSync(file)) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const meta = JSON.parse(psql(`select coalesce(metadata::text,'{}') from storage.objects where bucket_id=${sqlLit(bucket)} and name=${sqlLit(name)}`).out || '{}');
    res.writeHead(200, { 'Content-Type': meta.mimetype || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' });
    return res.end(fs.readFileSync(file));
  }
  if (req.method === 'POST' && op === 'list') {
    const bucket = parts[0];
    const { prefix = '' } = JSON.parse(raw.toString() || '{}');
    const pre = prefix ? prefix.replace(/\/?$/, '/') : '';
    const r = runAs(claims, `select coalesce(json_agg(t), '[]') from (select name, id, created_at, updated_at, metadata from storage.objects where bucket_id=${sqlLit(bucket)} and name like ${sqlLit(pre + '%')} order by created_at desc) t`);
    if (r.err) return send(res, 400, { message: r.err });
    const rows = JSON.parse(r.out);
    const out = [], folders = new Set();
    for (const row of rows) {
      const restName = row.name.slice(pre.length);
      if (restName.includes('/')) folders.add(restName.split('/')[0]);
      else out.push({ ...row, name: restName });
    }
    return send(res, 200, [...[...folders].map((f) => ({ name: f, id: null, metadata: null })), ...out]);
  }
  if (req.method === 'DELETE') {
    const bucket = op;
    const { prefixes = [] } = JSON.parse(raw.toString() || '{}');
    const r = runAs(claims, `with d as (delete from storage.objects where bucket_id=${sqlLit(bucket)} and name = any(array[${prefixes.map(sqlLit).join(',') || "''"}]::text[]) returning name) select coalesce(json_agg(name), '[]') from d`);
    if (r.err) return send(res, 400, { message: r.err });
    for (const n of JSON.parse(r.out)) fs.rmSync(path.join(STORE, bucket, n), { force: true });
    return send(res, 200, JSON.parse(r.out).map((name) => ({ name })));
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const bucket = op;
    const name = decodeURIComponent(parts.join('/'));
    const mime = req.headers['content-type'] || 'application/octet-stream';
    const b = JSON.parse(psql(`select row_to_json(b) from storage.buckets b where id=${sqlLit(bucket)}`).out || 'null');
    if (!b) return send(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (b.file_size_limit && raw.length > b.file_size_limit) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    if (b.allowed_mime_types && !b.allowed_mime_types.includes(mime)) return send(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${mime} is not supported` });
    const r = runAs(claims, `insert into storage.objects (bucket_id, name, owner, metadata) values (${sqlLit(bucket)}, ${sqlLit(name)}, ${claims ? sqlLit(claims.sub) : 'null'}, ${sqlLit(JSON.stringify({ size: raw.length, mimetype: mime }))}::jsonb)`);
    if (r.err) {
      if (/duplicate/.test(r.err)) return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    }
    const file = path.join(STORE, bucket, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, raw);
    return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
  }
  send(res, 404, { message: 'not found' });
}

// ------------------------------------------------------------------ http
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,x-upsert,cache-control,accept',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }
    LOG.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.pathname === '/__log') return send(res, 200, LOG.splice(0));
    if (url.pathname === '/__recovery') return send(res, 200, { link: lastRecovery });
    if (url.pathname === '/__expire') { tokens.forEach((t) => (t.exp = 0)); refresh.clear(); return send(res, 200, { ok: true }); }
    // public bucket objects are served without an API key, like Supabase
    if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/public/')) return storageHandler(req, res, url.pathname.slice(19), url, raw, null);
    if (req.headers.apikey !== process.env.ANON_KEY) return send(res, 401, { message: 'No API key found in request' });
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        const ep = url.pathname.slice(9);
        const body = raw.length ? JSON.parse(raw.toString()) : {};
        if (ep === 'token' && url.searchParams.get('grant_type') === 'password') {
          const r = psql(`select row_to_json(u) from (select id, email from auth.users where lower(email)=lower(${sqlLit(body.email || '')}) and encrypted_password = crypt(${sqlLit(body.password || '')}, encrypted_password)) u`);
          if (!r.out) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          const u = JSON.parse(r.out);
          lastSignIn.set(u.id, new Date().toISOString());
          return send(res, 200, issue(u));
        }
        if (ep === 'recover') {
          // like Supabase: same response whether or not the user exists; the "email" is kept for the test to read
          const r = psql(`select row_to_json(u) from (select id, email from auth.users where lower(email)=lower(${sqlLit(body.email || '')})) u`);
          if (r.out) {
            const t = issue(JSON.parse(r.out));
            lastRecovery = `${url.searchParams.get('redirect_to')}#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=${t.expires_in}&refresh_token=${t.refresh_token}&token_type=bearer&type=recovery`;
          }
          return send(res, 200, {});
        }
        if (ep === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
          const u = refresh.get(body.refresh_token);
          if (!u) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
          refresh.delete(body.refresh_token);
          return send(res, 200, issue(u));
        }
        const { claims, error } = claimsFrom(req);
        if (error || !claims) return send(res, 401, { code: 401, msg: error || 'missing token' });
        if (ep === 'logout') {
          if (url.searchParams.get('scope') === 'global') for (const [k, v] of tokens) if (v.sub === claims.sub) tokens.delete(k);
          tokens.delete(req.headers.authorization.slice(7));
          for (const [k, v] of refresh) if (v.id === claims.sub) refresh.delete(k);
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          return res.end();
        }
        if (ep === 'user' && req.method === 'PUT' && body.email) {
          pendingEmail.set(claims.sub, body.email);
          return send(res, 200, { id: claims.sub, email: claims.email, new_email: body.email });
        }
        if (ep === 'user' && req.method === 'PUT') {
          if ((body.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
          psql(`update auth.users set encrypted_password = crypt(${sqlLit(body.password)}, gen_salt('bf')) where id = ${sqlLit(claims.sub)}`);
          return send(res, 200, { id: claims.sub, email: claims.email });
        }
        if (ep === 'user') return send(res, 200, { id: claims.sub, email: claims.email, email_confirmed_at: '2026-09-27T10:00:00Z', last_sign_in_at: lastSignIn.get(claims.sub) || null, new_email: pendingEmail.get(claims.sub), role: 'authenticated' });
        return send(res, 404, { msg: 'not found' });
      }
      const { claims, error } = claimsFrom(req);
      if (error) return send(res, 401, { code: 'PGRST301', message: error });
      if (url.pathname.startsWith('/rest/v1/')) {
        const body = raw.length ? JSON.parse(raw.toString()) : undefined;
        return restHandler(req, res, url.pathname.slice(9), url, body, claims);
      }
      if (url.pathname.startsWith('/storage/v1/object/')) return storageHandler(req, res, url.pathname.slice(19), url, raw, claims);
      send(res, 404, { message: 'not found' });
    } catch (e) {
      send(res, e.status || 500, { message: e.message });
    }
  });
}).listen(PORT, () => console.log('gateway on', PORT));
