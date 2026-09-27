import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Logo, Spinner } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { auth } from '../lib/supabase';
import { isValidEmail } from '../lib/utils';

function Card({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Admin — Zohaib Maqbool`;
  }, [title]);
  return (
    <main className="login" id="main">
      <div className="login__card">
        <div className="login__brand">
          <Logo size={26} />
          <span className="mono">Admin</span>
        </div>
        <h1>{title}</h1>
        <p className="login__sub">{sub}</p>
        {children}
        <Link to="/admin/login" className="login__back">
          <Icon name="arrow-left" size={14} /> Back to sign in
        </Link>
      </div>
    </main>
  );
}

/** Step 1: ask Supabase to email a reset link. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    setError(null);
    setBusy(true);
    try {
      await auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Reset your password" sub="Enter your admin email and we'll send you a secure reset link.">
      {sent ? (
        <p className="login__notice" role="status">
          <Icon name="mail" size={16} /> If an admin account exists for <strong>{email}</strong>, a reset link is on its way. It expires after a short time.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="login__form">
          {error && (
            <p className="login__alert" role="alert">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
          <div className="afield">
            <label htmlFor="fp-email" className="afield__label">
              Email
            </label>
            <input id="fp-email" className="ainput" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus disabled={busy} />
          </div>
          <button className="btn btn--blue login__submit" disabled={busy}>
            {busy && <Spinner />} {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </Card>
  );
}

/** Step 2: the link from the email lands here with a one-time recovery session. */
export function ResetPassword() {
  const { navigate } = useRouter();
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const r = auth.consumeRecoveryLink(hash);
      // remove tokens from the address bar / history
      history.replaceState(null, '', window.location.pathname);
      if (r.ok) setState('ready');
      else {
        setError(r.error);
        setState('invalid');
      }
    } else if (auth.session) {
      setState('ready'); // e.g. page refreshed after the link was opened
    } else {
      setError('Open this page from the link in your reset email.');
      setState('invalid');
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.a.length < 8) return setError('Use at least 8 characters.');
    if (!/[a-zA-Z]/.test(pw.a) || !/\d/.test(pw.a)) return setError('Use a mix of letters and numbers.');
    if (pw.a !== pw.b) return setError('The passwords do not match.');
    setError(null);
    setBusy(true);
    try {
      await auth.updatePassword(pw.a);
      await auth.signOut();
      setState('done');
      setTimeout(() => navigate('/admin/login', { replace: true }), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the new password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Choose a new password" sub="Set a new password for your admin account.">
      {state === 'checking' && (
        <p className="login__notice">
          <Spinner /> Checking your reset link…
        </p>
      )}
      {state === 'invalid' && (
        <>
          <p className="login__alert" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
          <Link to="/admin/forgot-password" className="btn btn--ghost">
            Request a new link
          </Link>
        </>
      )}
      {state === 'done' && (
        <p className="login__notice" role="status">
          <Icon name="check" size={16} /> Password updated. Taking you to sign in…
        </p>
      )}
      {state === 'ready' && (
        <form onSubmit={submit} noValidate className="login__form">
          {error && (
            <p className="login__alert" role="alert">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
          <div className="afield">
            <label htmlFor="rp-a" className="afield__label">
              New password
            </label>
            <input id="rp-a" className="ainput" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoFocus disabled={busy} />
          </div>
          <div className="afield">
            <label htmlFor="rp-b" className="afield__label">
              Repeat new password
            </label>
            <input id="rp-b" className="ainput" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} disabled={busy} />
          </div>
          <button className="btn btn--blue login__submit" disabled={busy}>
            {busy && <Spinner />} {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </Card>
  );
}
