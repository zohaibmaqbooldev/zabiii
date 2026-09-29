/**
 * Browser side of the AI assistant. It only talks to our own server endpoint
 * (/api/ai); the Gemini key lives on the server and never reaches this code.
 * The admin's Supabase session token proves who is asking.
 */
import { ApiError, auth } from './supabase';

export type AiTask =
  | 'project_short'
  | 'project_full'
  | 'bio'
  | 'about'
  | 'experience'
  | 'education'
  | 'certificate_summary'
  | 'summary'
  | 'improve';

export type AiContext = Partial<Record<'title' | 'name' | 'role' | 'technologies' | 'category' | 'company' | 'position' | 'institution' | 'degree' | 'field' | 'issuer' | 'location' | 'focus' | 'goal' | 'dates' | 'notes' | 'related', string>>;

export interface AiRequest {
  task: AiTask;
  mode: 'generate' | 'improve';
  text?: string;
  context?: AiContext;
}

const ENDPOINT = '/api/ai';
const TIMEOUT_MS = 45_000;

async function call(method: 'GET' | 'POST', body?: unknown, signal?: AbortSignal) {
  const session = await auth.getSession();
  if (!session) throw new ApiError('Your session has expired. Sign in again.', 401, 'unauthorized');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    if (signal?.aborted) throw new ApiError('Cancelled.', 0, 'cancelled');
    if (ctrl.signal.aborted) throw new ApiError('The AI took too long to answer. Try again.', 0, 'timeout');
    throw new ApiError('Network error — check your connection and try again.', 0, 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string; code?: string; configured?: boolean; model?: string } | null;
  if (!res.ok || !json || json.ok !== true) {
    if (res.status === 404 && !json) throw new ApiError('The AI endpoint is not available on this deployment.', 404, 'no_endpoint');
    throw new ApiError(json?.error || 'The AI assistant is unavailable right now.', res.status, json?.code);
  }
  return json;
}

export async function aiWrite(req: AiRequest, signal?: AbortSignal): Promise<string> {
  const json = await call('POST', req, signal);
  const text = (json.text || '').trim();
  if (!text) throw new ApiError('The AI returned an empty answer. Try again.', 502, 'ai_empty');
  return text;
}

export async function aiStatus(): Promise<{ configured: boolean; model?: string }> {
  const json = await call('GET');
  return { configured: Boolean(json.configured), model: json.model };
}
