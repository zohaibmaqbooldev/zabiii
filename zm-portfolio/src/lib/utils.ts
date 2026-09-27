export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+\+/g, 'pp')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Only allow http(s) links out; anything else is treated as missing. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const v = u.trim();
  if (!v) return null;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) return v;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function isValidHttpUrl(u: string) {
  try {
    const url = new URL(u.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export function digitsOnly(s: string | null | undefined) {
  return (s || '').replace(/[^\d]/g, '');
}

export function whatsappLink(num: string | null | undefined, text?: string) {
  const d = digitsOnly(num);
  if (d.length < 8) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(num: string | null | undefined) {
  const d = (num || '').replace(/[^\d+]/g, '');
  return d.replace(/\D/g, '').length >= 7 ? `tel:${d}` : null;
}

export function prettyHost(u: string) {
  try {
    const url = new URL(u);
    return (url.hostname.replace(/^www\./, '') + url.pathname).replace(/\/$/, '');
  } catch {
    return u;
  }
}

export function formatDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }) {
  if (!d) return '';
  const date = new Date(d);
  return isNaN(date.getTime()) ? d : date.toLocaleDateString('en-GB', opts);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function uid() {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}
