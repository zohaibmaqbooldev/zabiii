import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type MouseEvent, type AnchorHTMLAttributes } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './utils';

/** A ~60-line client router: History API, view transitions, hash scrolling. */

interface RouterState {
  path: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}
const Ctx = createContext<RouterState>({ path: '/', search: '', navigate: () => {} });

function scrollToHash(hash: string, smooth: boolean) {
  const el = hash ? document.getElementById(hash.slice(1)) : null;
  if (el) el.scrollIntoView({ behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto', block: 'start' });
  else window.scrollTo({ top: 0 });
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));

  useEffect(() => {
    const onPop = () => setLoc({ path: location.pathname, search: location.search });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = new URL(to, location.href);
    const samePage = url.pathname === location.pathname && url.search === location.search;
    if (samePage && url.hash) {
      history.replaceState(null, '', url.hash);
      scrollToHash(url.hash, true);
      return;
    }
    const apply = () => {
      history[opts?.replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
      // flushSync so a view transition captures the new route's DOM
      flushSync(() => setLoc({ path: url.pathname, search: url.search }));
      // wait for the new route to render, then position the page
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToHash(url.hash, false)));
    };
    const doc = document as unknown as { startViewTransition?: (cb: () => void) => unknown };
    if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion() && !url.pathname.startsWith('/admin')) doc.startViewTransition(apply);
    else apply();
  }, []);

  return <Ctx.Provider value={{ ...loc, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
