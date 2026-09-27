import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Logo, Spinner } from '../components/ui';
import { isConfigured } from '../lib/supabase';
import { isValidEmail } from '../lib/utils';
import { Link } from '../lib/router';
import { useAuth } from './auth';

export function Login() {
  const { signIn, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Sign in · Admin — Zohaib Maqbool';
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <main className="login" id="main">
      <div className="login__card">
        <div className="login__brand">
          <Logo size={26} />
          <span className="mono">Admin</span>
        </div>
        <h1>Sign in to your portfolio</h1>
        <p className="login__sub">Manage projects, skills, education, certificates and images.</p>

        {!isConfigured && (
          <p className="login__alert" role="alert">
            <Icon name="alert" size={16} /> Supabase isn't configured for this build (missing URL / key).
          </p>
        )}
        {notice && !error && (
          <p className="login__notice" role="status">
            <Icon name="lock" size={16} /> {notice}
          </p>
        )}
        {error && (
          <p className="login__alert" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}

        <form onSubmit={submit} noValidate className="login__form">
          <div className="afield">
            <label htmlFor="login-email" className="afield__label">
              Email
            </label>
            <input id="login-email" className="ainput" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus disabled={busy} />
          </div>
          <div className="afield">
            <label htmlFor="login-pass" className="afield__label">
              Password
            </label>
            <div className="pass">
              <input id="login-pass" className="ainput" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eye-off' : 'eye'} size={17} />
              </button>
            </div>
          </div>
          <button className="btn btn--blue login__submit" type="submit" disabled={busy || !isConfigured}>
            {busy ? <Spinner /> : null} {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <Link to="/admin/forgot-password" className="login__link">
          Forgot password?
        </Link>
        <a href="/" className="login__back">
          <Icon name="arrow-left" size={14} /> Back to portfolio
        </a>
      </div>
    </main>
  );
}
