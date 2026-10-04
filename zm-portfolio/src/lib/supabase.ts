/**
 * A small, dependency-free Supabase client covering exactly what this site uses:
 * Auth (email + password, refresh, logout), PostgREST (select/insert/update/delete)
 * and Storage (upload with progress, list, remove, public URLs).
 * Only the public anon/publishable key is ever used in the browser.
 */

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const BUCKET = 'portfolio-images';
export const isConfigured = Boolean(SUPABASE_URL && ANON_KEY);

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Safe to show to the admin. Visitors only ever see generic copy. */
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- auth ---

export interface AuthUser {
  id: string;
  email?: string;
}
export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  user: AuthUser;
}
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'SESSION_EXPIRED' | 'TOKEN_REFRESHED';

const STORAGE_KEY = 'zm-admin-session';
let session: Session | null = readStoredSession();
const listeners = new Set<(e: AuthEvent, s: Session | null) => void>();
let refreshing: Promise<Session | null> | null = null;

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function storeSession(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: session lives in memory only */
  }
}
function emit(e: AuthEvent) {
  listeners.forEach((fn) => fn(e, session));
}

function toSession(json: Record<string, unknown>): Session {
  const expiresIn = Number(json.expires_in || 3600);
  return {
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token),
    expires_at: Number(json.expires_at) || Math.floor(Date.now() / 1000) + expiresIn,
    user: json.user as AuthUser,
  };
}

/** Why a request never got an HTTP response. Shows the host (public), never keys. */
export function unreachableError(): ApiError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ApiError('You appear to be offline. Check your internet connection and try again.', 0, 'network');
  }
  let host = SUPABASE_URL;
  try {
    host = new URL(SUPABASE_URL).host;
  } catch {
    /* keep raw */
  }
  return new ApiError(
    `Can't reach the Supabase server (${host}). The project may be paused or deleted, or this site is configured with the wrong Supabase URL.`,
    0,
    'network',
  );
}

/** Supabase answered, but rejected the site's public key itself. */
const isApiKeyProblem = (msg: string) => /invalid api key|no api key|apikey/i.test(msg);

async function authFetch(path: string, init: RequestInit) {
  if (!isConfigured) throw new ApiError('Supabase is not configured for this site yet.', 0, 'not_configured');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      ...init,
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  } catch {
    throw unreachableError();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json.msg || json.error_description || json.message || json.error || 'Request failed');
    const code = String(json.error_code || json.error || '');
    throw new ApiError(msg, res.status, code);
  }
  return json as Record<string, unknown>;
}

export const auth = {
  get session() {
    return session;
  },
  onChange(fn: (e: AuthEvent, s: Session | null) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async signIn(email: string, password: string) {
    try {
      const json = await authFetch('token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      storeSession(toSession(json));
      emit('SIGNED_IN');
      return session!;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 422)) {
        if (isApiKeyProblem(e.message)) throw new ApiError("Supabase rejected this site's public API key. Check the publishable/anon key configured for the site.", e.status, 'invalid_api_key');
        if (/confirm/i.test(e.message) || e.code === 'email_not_confirmed') throw new ApiError('This email address has not been confirmed yet.', e.status, 'email_not_confirmed');
        if (/email.*(disabled|not enabled)|provider.*disabled/i.test(e.message) || e.code === 'email_provider_disabled') throw new ApiError('Email/password sign-in is turned off in Supabase (Authentication → Sign In / Providers → Email).', e.status, 'email_provider_disabled');
        if (e.code === 'invalid_credentials' || /invalid login credentials|invalid grant/i.test(e.message)) throw new ApiError('Incorrect email or password.', e.status, 'invalid_credentials');
        throw new ApiError(e.message || 'Sign-in failed.', e.status, e.code);
      }
      if (e instanceof ApiError && e.status === 429) throw new ApiError('Too many attempts. Wait a minute and try again.', 429);
      throw e;
    }
  },
  /** Returns a valid session, refreshing it if it's about to expire. */
  async getSession(): Promise<Session | null> {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session;
    return auth.refresh();
  },
  refresh(): Promise<Session | null> {
    if (!session) return Promise.resolve(null);
    if (!refreshing) {
      const token = session.refresh_token;
      refreshing = authFetch('token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: token }),
      })
        .then((json) => {
          storeSession(toSession(json));
          emit('TOKEN_REFRESHED');
          return session;
        })
        .catch((e) => {
          // network blips keep the session; a rejected refresh token ends it
          if (e instanceof ApiError && e.code === 'network') throw e;
          storeSession(null);
          emit('SESSION_EXPIRED');
          return null;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  },
  /** scope 'global' also ends the session on every other device */
  async signOut(scope: 'local' | 'global' = 'local') {
    const s = session;
    storeSession(null);
    emit('SIGNED_OUT');
    if (s) {
      await authFetch(`logout${scope === 'global' ? '?scope=global' : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
    }
  },
  async updatePassword(password: string) {
    const s = await auth.getSession();
    if (!s) throw new ApiError('Your session has expired. Please sign in again.', 401);
    try {
      await authFetch('user', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ password }),
      });
    } catch (e) {
      if (e instanceof ApiError && /same/i.test(e.message)) throw new ApiError('The new password must be different from the current one.', e.status);
      if (e instanceof ApiError && /weak|at least|characters/i.test(e.message)) throw new ApiError(e.message, e.status);
      throw e;
    }
  },
  /** Re-check the current password before sensitive changes. Refreshes the session on success. */
  async verifyPassword(password: string) {
    const email = session?.user.email;
    if (!email) throw new ApiError('Your session has expired. Please sign in again.', 401);
    try {
      const json = await authFetch('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
      storeSession(toSession(json));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 401)) throw new ApiError('Your current password is incorrect.', e.status, 'invalid_credentials');
      throw e;
    }
  },
  /** Supabase emails a confirmation link to the new address (and, with secure change on, to the old one). */
  async updateEmail(email: string) {
    const s = await auth.getSession();
    if (!s) throw new ApiError('Your session has expired. Please sign in again.', 401);
    const redirect = `${location.origin}/admin/login`;
    await authFetch(`user?redirect_to=${encodeURIComponent(redirect)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify({ email }),
    });
  },
  /** Full account record from Supabase Auth (email, confirmation, last sign-in…). */
  async getUser(): Promise<AccountInfo> {
    const s = await auth.getSession();
    if (!s) throw new ApiError('Your session has expired. Please sign in again.', 401);
    return (await authFetch('user', { method: 'GET', headers: { Authorization: `Bearer ${s.access_token}` } })) as unknown as AccountInfo;
  },
  /** Sends the password-reset email. Resolves the same way whether or not the account exists. */
  async requestPasswordReset(email: string) {
    const redirect = `${location.origin}/admin/reset-password`;
    try {
      await authFetch(`recover?redirect_to=${encodeURIComponent(redirect)}`, { method: 'POST', body: JSON.stringify({ email }) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) throw new ApiError('Too many reset emails were requested. Please wait a few minutes.', 429);
      if (e instanceof ApiError && (e.code === 'network' || e.code === 'not_configured')) throw e;
      // don't reveal whether an address exists
    }
  },
  /**
   * The reset email links back with tokens in the URL fragment
   * (#access_token=…&refresh_token=…&type=recovery). Turn them into a session.
   */
  consumeRecoveryLink(hash: string): { ok: true } | { ok: false; error: string } {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    if (p.get('error') || p.get('error_description')) {
      const d = (p.get('error_description') || '').replace(/\+/g, ' ');
      return { ok: false, error: /expired|invalid/i.test(d) ? 'This reset link has expired or was already used. Request a new one.' : d || 'This reset link is not valid.' };
    }
    const access = p.get('access_token');
    const refresh = p.get('refresh_token');
    if (!access || !refresh || p.get('type') !== 'recovery') return { ok: false, error: 'This reset link is not valid. Request a new one.' };
    let user: AuthUser = { id: '' };
    try {
      const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      user = { id: payload.sub, email: payload.email };
    } catch {
      /* opaque token: user is filled in by getUser() later */
    }
    storeSession({
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
      user,
    });
    return { ok: true };
  },
};

export interface AccountInfo {
  id: string;
  email?: string;
  new_email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  role?: string;
}

// Keep the admin session alive across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    session = readStoredSession();
    emit(session ? 'TOKEN_REFRESHED' : 'SIGNED_OUT');
  });
}

// ---------------------------------------------------------------- rest ---

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { apikey: ANON_KEY };
  const s = await auth.getSession().catch(() => session);
  if (s) h.Authorization = `Bearer ${s.access_token}`;
  return h;
}

function friendly(status: number, body: Record<string, unknown>): ApiError {
  const code = String(body.code || '');
  const raw = String(body.message || body.msg || body.error || '');
  if (code === '42501' || status === 403) return new ApiError('You do not have permission to change this.', status, code);
  if (code === '23505') return new ApiError('That value must be unique — something with the same slug/name already exists.', status, code);
  if (code === '42P01' || code === 'PGRST205') return new ApiError('Database setup is incomplete. Run supabase/setup.sql in the SQL editor.', status, code);
  if (code === '42703' || code === 'PGRST204') return new ApiError('A database column is missing. Run supabase/setup.sql again.', status, code);
  if (code === '23502') return new ApiError('A required field is missing.', status, code);
  if (isApiKeyProblem(raw)) return new ApiError("Supabase rejected this site's public API key. Check the publishable/anon key configured for the site.", status, 'invalid_api_key');
  if (/JWT expired/i.test(raw)) return new ApiError('Your session has expired. Please sign in again.', 401, 'jwt_expired');
  return new ApiError(raw || `Request failed (${status})`, status, code);
}

async function rest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  table: string,
  query: Record<string, string>,
  body?: unknown,
  retried = false,
): Promise<T> {
  if (!isConfigured) throw new ApiError('Supabase is not configured for this site yet.', 0, 'not_configured');
  const qs = new URLSearchParams(query).toString();
  const headers: Record<string, string> = { ...(await authHeaders()), Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
  }
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw unreachableError();
  }
  if (res.status === 401 && !retried && session) {
    if (await auth.refresh()) return rest<T>(method, table, query, body, true);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw friendly(res.status, json || {});
  return json as T;
}

type Match = Record<string, string | number | boolean>;
const toFilters = (match: Match) =>
  Object.fromEntries(Object.entries(match).map(([k, v]) => [k, `eq.${v}`]));

export const db = {
  select<T>(table: string, query: Record<string, string> = { select: '*' }) {
    return rest<T[]>('GET', table, query);
  },
  async insert<T>(table: string, rows: Partial<T> | Partial<T>[]) {
    const out = await rest<T[]>('POST', table, { select: '*' }, rows);
    return out;
  },
  async update<T>(table: string, match: Match, patch: Partial<T>) {
    const out = await rest<T[]>('PATCH', table, { ...toFilters(match), select: '*' }, patch);
    // RLS hides rows you can't touch: an update that matched nothing was not allowed
    if (!out || out.length === 0) throw new ApiError('Nothing was updated — the item no longer exists or you lack permission.', 404);
    return out;
  },
  async remove(table: string, match: Match) {
    const out = await rest<unknown[]>('DELETE', table, { ...toFilters(match), select: 'id' });
    if (!out || out.length === 0) throw new ApiError('Nothing was deleted — the item no longer exists or you lack permission.', 404);
    return out;
  },
};

// ------------------------------------------------------------- storage ---

export interface StorageObject {
  name: string;
  id: string | null;
  updated_at?: string;
  created_at?: string;
  metadata?: { size?: number; mimetype?: string } | null;
}

export function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Storage path for a URL that points into our bucket, else null. */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export const storage = {
  /** Upload with progress (XHR, because fetch has no upload progress). */
  async upload(path: string, file: Blob, onProgress?: (pct: number) => void): Promise<string> {
    if (!isConfigured) throw new ApiError('Supabase is not configured for this site yet.', 0, 'not_configured');
    const headers = await authHeaders();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'max-age=31536000');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onerror = () => reject(new ApiError('Upload failed — network error.', 0, 'network'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(publicUrl(path));
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        const msg = String(body.message || body.error || '');
        if (xhr.status === 413 || /size/i.test(msg)) return reject(new ApiError('That image is too large for storage (max 5 MB).', xhr.status));
        if (/mime|type/i.test(msg)) return reject(new ApiError('That file type is not allowed.', xhr.status));
        if (xhr.status === 403 || /security policy|Unauthorized/i.test(msg)) return reject(new ApiError('Upload not permitted — is this account an admin?', xhr.status));
        if (xhr.status === 404 && /bucket/i.test(msg)) return reject(new ApiError('Storage bucket "portfolio-images" was not found.', 404));
        reject(new ApiError(msg || `Upload failed (${xhr.status})`, xhr.status));
      };
      xhr.send(file);
    });
  },
  async remove(paths: string[]) {
    if (!paths.length) return;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    }).catch(() => {
      throw unreachableError();
    });
    if (!res.ok) throw new ApiError('Could not delete the file from storage.', res.status);
  },
  async list(prefix: string): Promise<StorageObject[]> {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 500, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
    }).catch(() => {
      throw unreachableError();
    });
    if (!res.ok) throw new ApiError('Could not load the media library.', res.status);
    return res.json();
  },
};
