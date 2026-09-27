import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';
import { cx } from '../lib/utils';

// ------------------------------------------------------------------ Logo ---

export function Logo({ src, size = 28, className }: { src?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = !broken && src ? src : '/brand/zm-mark.webp';
  return (
    <img
      src={url}
      onError={() => setBroken(true)}
      alt="ZM — Zohaib Maqbool"
      height={size}
      width={Math.round(size * 1.84)}
      className={cx('logo-mark', className)}
      style={{ height: size, width: 'auto' }}
      decoding="async"
    />
  );
}

// ------------------------------------------------------------- Reveal -----

/** Adds `.is-in` when the element scrolls into view (once). CSS does the rest. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, as: Tag = 'div', className, delay = 0, ...rest }: {
  children: ReactNode;
  as?: 'div' | 'section' | 'li' | 'article' | 'header' | 'span';
  className?: string;
  delay?: number;
  id?: string;
}) {
  const ref = useReveal<HTMLElement>();
  const T = Tag as 'div';
  return (
    <T ref={ref as RefObject<HTMLDivElement>} className={cx('reveal', className)} style={{ ['--d' as string]: `${delay}ms` }} {...rest}>
      {children}
    </T>
  );
}

// ------------------------------------------------------------ Skeleton ----

export function Skeleton({ w, h = 14, className, round }: { w?: string | number; h?: string | number; className?: string; round?: boolean }) {
  return <span className={cx('skeleton', round && 'skeleton--round', className)} style={{ width: w, height: h }} aria-hidden="true" />;
}

// ---------------------------------------------------------- EmptyState ----

export function EmptyState({ icon = 'layers', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={22} />
      </div>
      <p className="empty__title">{title}</p>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  );
}

// ------------------------------------------------------------- Toasts -----

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 6500 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('toast', `toast--${t.tone}`)}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'sparkle'} size={16} />
            <span>{t.text}</span>
            <button className="toast__x" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------- Dialog -----

/** Accessible modal built on <dialog>: focus trap, Esc to close, backdrop click. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.classList.add('no-scroll');
    }
    if (!open && d.open) d.close();
    return () => document.documentElement.classList.remove('no-scroll');
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx('dialog', `dialog--${size}`, className)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="dialog__inner">
          <header className="dialog__head">
            <h2 id="dialog-title">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <Icon name="close" />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? <Spinner /> : <Icon name="trash" size={16} />} {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-msg">{message}</div>
    </Dialog>
  );
}

export const Spinner = ({ size = 16 }: { size?: number }) => <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
