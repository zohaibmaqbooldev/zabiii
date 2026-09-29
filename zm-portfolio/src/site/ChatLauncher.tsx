import { lazy, Suspense, useEffect, useState } from 'react';

// The chat window's code is only downloaded when a visitor opens it.
const ChatPanel = lazy(() => import('./ChatPanel').then((m) => ({ default: m.ChatPanel })));

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" />
    <path d="M8.5 10.5h7M8.5 14h4.5" />
  </svg>
);

/** Floating "Zabiii AI" button (bottom-right, above the WhatsApp button). */
export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`chat-fab${open ? ' is-open' : ''}`}
        aria-label={open ? 'Close Zabiii AI chat' : 'Chat with Zabiii AI'}
        aria-expanded={open}
        aria-controls="zabiii-chat"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <ChatIcon />
        )}
        {!open && <span className="chat-fab__label">Ask AI</span>}
      </button>
      {loaded && (
        <Suspense fallback={open ? <div className="chat-panel chat-panel--loading" role="status">Loading chat…</div> : null}>
          <ChatPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
