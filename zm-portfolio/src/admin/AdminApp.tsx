import { useEffect, useState } from 'react';
import { Spinner } from '../components/ui';
import { match, useRouter } from '../lib/router';
import { AuthProvider, useAuth } from './auth';
import { Login } from './Login';
import { Overview } from './Overview';
import { ProjectsAdmin } from './Projects';
import { ProjectForm } from './ProjectForm';
import { SkillsAdmin } from './Skills';
import { EducationAdmin } from './Education';
import { CertificatesAdmin } from './Certificates';
import { ProfileAdmin } from './Profile';
import { SocialAdmin } from './Social';
import { MediaAdmin } from './Media';
import { SettingsAdmin } from './Settings';
import { ExperienceAdmin } from './Experience';
import { ContactAdmin } from './Contact';
import { ForgotPassword, ResetPassword } from './PasswordReset';

/** Pages that must work without an admin session. */
const PUBLIC_AUTH_PAGES = ['/admin/login', '/admin/forgot-password', '/admin/reset-password'];

/** The admin stylesheet is its own file so visitors never download it. */
function useAdminStyles() {
  const [ready, setReady] = useState(() => Boolean(document.getElementById('admin-css')));
  useEffect(() => {
    if (ready) return;
    const href = document.querySelector<HTMLMetaElement>('meta[name="zm-admin-css"]')?.content;
    if (!href) return setReady(true);
    const link = document.createElement('link');
    link.id = 'admin-css';
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => setReady(true);
    document.head.appendChild(link);
    // robots shouldn't index the admin
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
  }, [ready]);
  return ready;
}

function Guarded() {
  const { status } = useAuth();
  const { path, navigate } = useRouter();

  const authPage = PUBLIC_AUTH_PAGES.includes(path);
  useEffect(() => {
    if (status === 'signed-out' && !authPage) navigate('/admin/login', { replace: true });
    if (status === 'admin' && (path === '/admin/login' || path === '/admin' || path === '/admin/')) navigate('/admin/dashboard', { replace: true });
  }, [status, path, navigate, authPage]);

  if (path === '/admin/forgot-password') return <ForgotPassword />;
  if (path === '/admin/reset-password') return <ResetPassword />;
  if (status === 'checking') {
    return (
      <div className="admin-loading">
        <Spinner size={22} />
        <span>Checking your session…</span>
      </div>
    );
  }
  if (status !== 'admin') return path === '/admin/login' ? <Login /> : null;

  // ---- authenticated admin routes
  const edit = match('/admin/projects/:id', path);
  if (path === '/admin/dashboard') return <Overview />;
  if (path === '/admin/projects') return <ProjectsAdmin />;
  if (edit) return <ProjectForm key={edit.id} id={edit.id === 'new' ? null : edit.id} />;
  if (path === '/admin/skills') return <SkillsAdmin />;
  if (path === '/admin/education') return <EducationAdmin />;
  if (path === '/admin/certificates') return <CertificatesAdmin />;
  if (path === '/admin/profile') return <ProfileAdmin />;
  if (path === '/admin/social') return <SocialAdmin />;
  if (path === '/admin/experience') return <ExperienceAdmin />;
  if (path === '/admin/contact') return <ContactAdmin />;
  if (path === '/admin/media') return <MediaAdmin />;
  if (path === '/admin/settings') return <SettingsAdmin />;
  return <Overview />;
}

export default function AdminApp() {
  const ready = useAdminStyles();
  if (!ready) return <div className="admin-boot" aria-busy="true" />;
  return (
    <AuthProvider>
      <Guarded />
    </AuthProvider>
  );
}
