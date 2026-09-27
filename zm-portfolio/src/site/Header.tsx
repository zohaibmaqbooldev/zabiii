import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Logo } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { usePortfolio, useProfile } from '../lib/portfolio';
import { cx, pad2 } from '../lib/utils';

export const NAV = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'contact', label: 'Contact' },
];

function useScrollSpy(enabled: boolean) {
  const [active, setActive] = useState('home');
  useEffect(() => {
    if (!enabled || !('IntersectionObserver' in window)) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        let best = '';
        let bestRatio = 0;
        seen.forEach((r, id) => {
          if (r > bestRatio) {
            bestRatio = r;
            best = id;
          }
        });
        if (best) setActive(best === 'work' ? 'projects' : best);
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.01, 0.2, 0.5, 1] },
    );
    const t = setTimeout(() => {
      [...NAV.map((n) => n.id), 'work'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) io.observe(el);
      });
    }, 300);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [enabled]);
  return active;
}

export function Header() {
  const { path } = useRouter();
  const p = useProfile();
  const onHome = path === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useScrollSpy(onHome);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('no-scroll', open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => setOpen(false), [path]);

  const href = (id: string) => (id === 'home' ? '/#home' : `/#${id}`);
  const { data } = usePortfolio();
  // Experience only appears in the menu once there is something to show
  const nav = NAV.filter((n) => n.id !== 'experience' || data.experience.length > 0);

  return (
    <header className={cx('site-header', scrolled && 'is-scrolled', open && 'is-open')}>
      <div className="container site-header__bar">
        <Link to="/#home" className="brand" aria-label={`${p.name} — home`}>
          <Logo src={p.logo} size={22} />
          <span className="brand__text">
            <span className="brand__name">{p.name}</span>
            <span className="brand__role">{p.title}</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          <ul>
            {nav.map((n) => (
              <li key={n.id}>
                <Link to={href(n.id)} className={cx('site-nav__link', onHome && active === n.id && 'is-active')} aria-current={onHome && active === n.id ? 'true' : undefined}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__end">
          {p.github && (
            <a className="icon-btn" href={p.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub profile (opens in new tab)">
              <Icon name="github" size={18} />
            </a>
          )}
          {p.linkedin && (
            <a className="icon-btn" href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn profile (opens in new tab)">
              <Icon name="linkedin" size={17} />
            </a>
          )}
          <Link to="/#contact" className="btn btn--ghost btn--sm site-header__cta">
            Let's talk
          </Link>
          <button
            ref={menuBtn}
            className="menu-btn"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="mobile-menu" inert={!open} aria-hidden={!open}>
        <nav aria-label="Mobile">
          <ol>
            {nav.map((n, i) => (
              <li key={n.id} style={{ ['--i' as string]: i }}>
                <Link to={href(n.id)} onClick={() => setOpen(false)}>
                  <span className="mono">{pad2(i)}</span>
                  {n.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mobile-menu__foot">
          {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
          <div className="mobile-menu__social">
            {p.github && (
              <a className="icon-btn" href={p.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <Icon name="github" />
              </a>
            )}
            {p.linkedin && (
              <a className="icon-btn" href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <Icon name="linkedin" />
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
