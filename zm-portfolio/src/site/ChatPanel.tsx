import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

type Role = 'user' | 'model';
interface Msg {
  role: Role;
  text: string;
}

const STORE_KEY = 'zabiii-chat-v1'; // this browser tab only (sessionStorage)
const MAX_CHARS = 800;
const TIMEOUT_MS = 50_000;
const SUGGESTIONS = ['What services do you offer?', 'How much does an app cost?', 'Show me your projects', 'Are you available for work?'];
const WELCOME = "Hi! I'm Zabiii AI, Zohaib's portfolio assistant. Ask me about his skills, projects, services or pricing — in English or Urdu.";

function loadHistory(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(list) ? list.filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string').slice(-40) : [];
  } catch {
    return [];
  }
}
function saveHistory(list: Msg[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-40)));
  } catch {
    /* private mode: history just isn't kept */
  }
}

/** Turns URLs, emails and /projects/… paths into safe links; everything else stays plain text. */
function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])|([\w.+-]+@[\w-]+\.[\w.-]*\w)|(\/projects\/[a-z0-9-]+)|(#contact\b)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [whole, url, email, project, contact] = m;
    if (url) out.push(<a key={i++} href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>);
    else if (email) out.push(<a key={i++} href={`mailto:${email}`}>{email}</a>);
    else if (project) out.push(<a key={i++} href={project}>{project}</a>);
    else if (contact) out.push(<a key={i++} href="/#contact">contact form</a>);
    else out.push(whole);
    last = m.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => saveHistory(messages), [messages]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, error, open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const ask = async (history: Msg[]) => {
    setBusy(true);
    setError(null);
    ctrl.current = new AbortController();
    const timer = setTimeout(() => ctrl.current?.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),
        signal: ctrl.current.signal,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; reply?: string; error?: string } | null;
      if (!res.ok || !json?.ok || !json.reply) throw new Error(json?.error || 'The assistant is unavailable right now. Please use the contact form or WhatsApp.');
      setMessages([...history, { role: 'model', text: json.reply }]);
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      setError(aborted ? 'The assistant took too long to answer. Please try again.' : navigator.onLine === false ? 'You seem to be offline.' : (e as Error).message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
      ctrl.current = null;
    }
  };

  const send = (raw: string) => {
    const text = raw.trim().slice(0, MAX_CHARS);
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, text }];
    setMessages(next);
    setInput('');
    ask(next);
  };
  const retry = () => {
    if (!busy && messages.length && messages[messages.length - 1].role === 'user') ask(messages);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };
  const clear = () => {
    ctrl.current?.abort();
    setMessages([]);
    setError(null);
  };

  return (
    <section id="zabiii-chat" className={`chat-panel${open ? ' is-open' : ''}`} role="dialog" aria-label="Zabiii AI chat" aria-hidden={!open} hidden={!open}>
      <header className="chat-panel__head">
        <span className="chat-panel__avatar" aria-hidden="true">Z</span>
        <div className="chat-panel__title">
          <strong>Zabiii AI</strong>
          <small>Zohaib's portfolio assistant</small>
        </div>
        {messages.length > 0 && (
          <button type="button" className="chat-panel__icon-btn" onClick={clear} aria-label="Clear chat" title="Clear chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        )}
        <button type="button" className="chat-panel__icon-btn" onClick={onClose} aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className="chat-panel__list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        <div className="chat-msg chat-msg--model">{WELCOME}</div>
        {messages.length === 0 && (
          <div className="chat-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            {m.role === 'model' ? linkify(m.text) : m.text}
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-msg--model chat-msg--typing" role="status" aria-label="Zabiii AI is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      </div>

      <form className="chat-panel__form" onSubmit={onSubmit}>
        <label htmlFor="chat-input" className="sr-only">
          Your message
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={MAX_CHARS}
          placeholder="Ask about skills, projects, pricing…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="chat-panel__send" disabled={busy || !input.trim()} aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
          </svg>
        </button>
      </form>
      <p className="chat-panel__note">AI answers can be wrong — confirm details with Zohaib.</p>
    </section>
  );
}
