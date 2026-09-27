import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Link } from '../lib/router';
import { usePortfolio, useProfile } from '../lib/portfolio';
import { prefersReducedMotion, whatsappLink } from '../lib/utils';

const DEFAULT_PORTRAIT = '/images/profile-928.webp';

export function Hero() {
  const p = useProfile();
  const { data } = usePortfolio();
  const figure = useRef<HTMLElement>(null);

  // A whisper of parallax on the portrait: pointer-driven, rAF-throttled, desktop only.
  useEffect(() => {
    const el = figure.current;
    if (!el || prefersReducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.setProperty('--px', (x * 10).toFixed(2) + 'px');
        el.style.setProperty('--py', (y * 10).toFixed(2) + 'px');
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const [first, ...rest] = p.name.split(' ');
  const wa = whatsappLink(p.whatsapp);
  const socials = [
    p.github && { href: p.github, icon: 'github', label: 'GitHub' },
    p.linkedin && { href: p.linkedin, icon: 'linkedin', label: 'LinkedIn' },
    p.email && { href: `mailto:${p.email}`, icon: 'mail', label: 'Email' },
    wa && { href: wa, icon: 'whatsapp', label: 'WhatsApp' },
  ].filter(Boolean) as { href: string; icon: string; label: string }[];

  return (
    <section id="home" className="hero" aria-labelledby="hero-title">
      <div className="hero__backdrop" aria-hidden="true" />
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="hero__eyebrow mono">
            <span className="live-dot" aria-hidden="true" />
            <span>Portfolio</span>
            <span className="hero__eyebrow-sep" aria-hidden="true" />
            <span>{new Date().getFullYear()}</span>
            <span className="hero__eyebrow-sep" aria-hidden="true" />
            <span>{p.location}</span>
          </p>

          <h1 id="hero-title" className="hero__title">
            <span className="hero__hi serif">Hi, I'm</span>
            <span className="hero__name">
              <span className="hero__line">{first}</span>
              {rest.length > 0 && <span className="hero__line hero__line--2">{rest.join(' ')}</span>}
            </span>
          </h1>

          <p className="hero__role">{p.headline}</p>
          <p className="hero__intro">{p.bio}</p>

          <div className="hero__ctas">
            <Link to="/#work" className="btn btn--primary">
              View My Work <Icon name="arrow" size={17} className="btn__arrow" />
            </Link>
            <Link to="/#contact" className="btn btn--ghost">
              Let's Connect
            </Link>
          </div>

          {socials.length > 0 && (
            <ul className="hero__social" aria-label="Elsewhere">
              {socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className="hero__social-link"
                    {...(s.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    aria-label={s.label}
                  >
                    <Icon name={s.icon} size={17} />
                    <span>{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <figure ref={figure} className="portrait" aria-label={`Portrait of ${p.name}`}>
          <div className="portrait__offset" aria-hidden="true" />
          <div className="portrait__frame">
            <SmartImage
              src={p.avatar || DEFAULT_PORTRAIT}
              alt={`${p.name}, ${p.title}`}
              sizes="(max-width: 900px) 86vw, 460px"
              priority
              className="portrait__img"
              position="50% 20%"
              fallbackLabel={p.name}
            />
            <span className="portrait__scan" aria-hidden="true" />
          </div>
          <span className="tick tick--tl" aria-hidden="true" />
          <span className="tick tick--tr" aria-hidden="true" />
          <span className="tick tick--bl" aria-hidden="true" />
          <span className="tick tick--br" aria-hidden="true" />
          <span className="portrait__side mono" aria-hidden="true">
            ZM — {p.educationLabel}
          </span>
          <figcaption className="portrait__tag">
            <span className="live-dot" aria-hidden="true" />
            <span>
              <strong>Currently</strong> studying {p.educationLabel}
            </span>
          </figcaption>
        </figure>
      </div>

      <div className="container">
        <dl className="hero__facts">
          <div>
            <dt className="mono">Study</dt>
            <dd>{p.educationLabel}</dd>
          </div>
          <div>
            <dt className="mono">Focus</dt>
            <dd>{p.focus}</dd>
          </div>
          <div>
            <dt className="mono">Based in</dt>
            <dd>{p.location}</dd>
          </div>
          <div>
            <dt className="mono">Projects</dt>
            <dd>{data.projects.length ? String(data.projects.length).padStart(2, '0') : '—'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
