import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Logo } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { cx } from '../lib/utils';
import { useAuth } from './auth';

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/profile', label: 'Profile', icon: 'user' },
  { to: '/admin/skills', label: 'Skills', icon: 'code' },
  { to: '/admin/projects', label: 'Projects', icon: 'folder' },
  { to: '/admin/certificates', label: 'Certificates', icon: 'award' },
  { to: '/admin/education', label: 'Education', icon: 'cap' },
  { to: '/admin/experience', label: 'Experience', icon: 'layers' },
  { to: '/admin/social', label: 'Social Links', icon: 'share' },
  { to: '/admin/contact', label: 'Contact Info', icon: 'phone' },
  { to: '/admin/media', label: 'Media', icon: 'image' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export function AdminLayout({ title, actions, children, back }: { title: string; actions?: ReactNode; children: ReactNode; back?: { to: string; label: string } }) {
  const { path } = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.title = `${title} · Admin — Zohaib Maqbool`;
  }, [title]);

  return (
    <div className={cx('admin', open && 'nav-open')}>
      <aside className="admin-side" aria-label="Admin navigation">
        <div className="admin-side__brand">
          <Logo size={20} />
          <span>
            <strong>Portfolio CMS</strong>
            <small>Zohaib Maqbool</small>
          </span>
        </div>
        <nav>
          <ul>
            {ADMIN_NAV.map((n) => {
              const active = path === n.to || (n.to !== '/admin/dashboard' && path.startsWith(n.to));
              return (
                <li key={n.to}>
                  <Link to={n.to} className={cx('admin-side__link', active && 'is-active')} aria-current={active ? 'page' : undefined}>
                    <Icon name={n.icon} size={17} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="admin-side__foot">
          <a href="/" target="_blank" rel="noopener" className="admin-side__link">
            <Icon name="external" size={17} /> View live site
          </a>
          <div className="admin-side__user">
            <span className="avatar" aria-hidden="true">
              {(user?.email || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="admin-side__email" title={user?.email}>
              {user?.email}
            </span>
            <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="admin-scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <div className="admin-main">
        <header className="admin-top">
          <button className="icon-btn admin-top__menu" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
            <Icon name="menu" />
          </button>
          <div className="admin-top__title">
            {back && (
              <Link to={back.to} className="admin-top__back">
                <Icon name="arrow-left" size={15} /> {back.label}
              </Link>
            )}
            <h1>{title}</h1>
          </div>
          {actions && <div className="admin-top__actions">{actions}</div>}
        </header>
        <main className="admin-content" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({ title, description, children, actions, className }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cx('panel', className)}>
      {(title || actions) && (
        <header className="panel__head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <Icon name="alert" size={18} />
      <p>{message}</p>
      <button className="btn btn--ghost btn--sm" onClick={onRetry}>
        <Icon name="refresh" size={15} /> Retry
      </button>
    </div>
  );
}
