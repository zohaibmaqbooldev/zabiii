import { Icon, platformIcon } from '../components/Icon';
import { Logo } from '../components/ui';
import { Link } from '../lib/router';
import { usePortfolio, useProfile } from '../lib/portfolio';
import { safeUrl } from '../lib/utils';
import { NAV } from './Header';

export function Footer() {
  const p = useProfile();
  const { data } = usePortfolio();
  const links = [
    p.github && { label: 'GitHub', href: p.github, icon: 'github' },
    p.linkedin && { label: 'LinkedIn', href: p.linkedin, icon: 'linkedin' },
    ...data.socials
      .filter((s) => !/github|linkedin/i.test(s.platform) && safeUrl(s.url))
      .map((s) => ({ label: s.platform, href: safeUrl(s.url)!, icon: platformIcon(s.platform, s.icon) })),
  ].filter(Boolean) as { label: string; href: string; icon: string }[];

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Logo src={p.logo} size={40} />
            <p className="site-footer__name">{p.name}</p>
            <p className="site-footer__role">{p.headline}</p>
          </div>
          <nav aria-label="Footer" className="site-footer__nav">
            <p className="mono">Index</p>
            <ul>
              {NAV.filter((n) => n.id !== 'experience' || data.experience.length > 0).map((n) => (
                <li key={n.id}>
                  <Link to={`/#${n.id}`}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          {links.length > 0 && (
            <div className="site-footer__nav">
              <p className="mono">Elsewhere</p>
              <ul>
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer">
                      <Icon name={l.icon} size={14} /> {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="site-footer__word" aria-hidden="true">
          {p.name}
        </div>
        <div className="site-footer__bottom">
          <p>
            © {new Date().getFullYear()} {p.name}. All rights reserved.
          </p>
          <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top <Icon name="arrow-up" size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
