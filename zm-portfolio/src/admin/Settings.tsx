import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Skeleton, Spinner, useToast } from '../components/ui';
import { auth, isConfigured, SUPABASE_URL, type AccountInfo } from '../lib/supabase';
import { formatDate, isValidEmail } from '../lib/utils';
import { useAuth } from './auth';
import { Field } from './fields';
import { AdminLayout, Panel } from './Layout';

type Check = { label: string; ok: boolean; detail?: string };

const TABLES = ['projects', 'skills', 'education', 'certificates', 'experience', 'profiles', 'social_links'];

/**
 * Tries INSERT / UPDATE / DELETE WITHOUT a session — exactly like an anonymous
 * visitor calling the API directly — and reports whether the database refuses them.
 * Non-destructive: the bodies carry an invalid id and the filters match no rows.
 */
async function runSecurityCheck(): Promise<Check[]> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const zero = '00000000-0000-0000-0000-000000000000';
  const refused = (r: Response) => r.status === 401 || r.status === 403;
  const out: Check[] = [];
  for (const table of TABLES) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: h, body: JSON.stringify({ id: 'probe' }) });
    const upd = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${zero}`, { method: 'PATCH', headers: h, body: JSON.stringify({ id: 'probe' }) });
    const del = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${zero}`, { method: 'DELETE', headers: h });
    const bad = [!refused(ins) && 'insert', !refused(upd) && 'update', !refused(del) && 'delete'].filter(Boolean);
    out.push({ label: `Visitors cannot modify ${table}`, ok: bad.length === 0, detail: bad.length ? `${bad.join(', ')} NOT refused — run setup.sql` : 'insert, update & delete refused' });
  }
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/portfolio-images/security-check-${Date.now()}.webp`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'image/webp' },
    body: new Blob([new Uint8Array(200)], { type: 'image/webp' }),
  });
  out.push({ label: 'Visitors cannot upload images', ok: !up.ok, detail: up.ok ? 'upload ALLOWED — run setup.sql' : 'upload refused' });
  return out;
}

export function SettingsAdmin() {
  const toast = useToast();
  const { signOut } = useAuth();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accErr, setAccErr] = useState<string | null>(null);

  // password
  const [pw, setPw] = useState({ current: '', a: '', b: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  // email
  const [email, setEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  // session
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  // security
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);

  const loadAccount = () =>
    auth
      .getUser()
      .then((a) => {
        setAccount(a);
        setAccErr(null);
      })
      .catch((e) => setAccErr(e instanceof Error ? e.message : 'Could not load the account.'));
  useEffect(() => {
    loadAccount();
  }, []);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.current) return setPwErr('Enter your current password.');
    if (pw.a.length < 8) return setPwErr('Use at least 8 characters for the new password.');
    if (!/[a-zA-Z]/.test(pw.a) || !/\d/.test(pw.a)) return setPwErr('Use a mix of letters and numbers.');
    if (pw.a !== pw.b) return setPwErr('The new passwords do not match.');
    setPwErr(null);
    setPwBusy(true);
    try {
      await auth.verifyPassword(pw.current);
      await auth.updatePassword(pw.a);
      setPw({ current: '', a: '', b: '' });
      toast('Password changed');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setPwBusy(false);
    }
  };

  const changeEmail = async (e: FormEvent) => {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!isValidEmail(next)) return setEmailErr('Enter a valid email address.');
    if (next === account?.email?.toLowerCase()) return setEmailErr('That is already your admin email.');
    if (!emailPw) return setEmailErr('Enter your current password to confirm.');
    setEmailErr(null);
    setEmailBusy(true);
    try {
      await auth.verifyPassword(emailPw);
      await auth.updateEmail(next);
      setEmailSent(next);
      setEmail('');
      setEmailPw('');
      loadAccount();
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Could not change the email.');
    } finally {
      setEmailBusy(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      setChecks(await runSecurityCheck());
    } catch {
      toast('Security check could not reach Supabase', 'error');
    } finally {
      setChecking(false);
    }
  };

  const s = auth.session;
  const expires = s ? new Date(s.expires_at * 1000) : null;

  return (
    <AdminLayout
      title="Settings"
      actions={
        <button className="btn btn--ghost btn--sm" onClick={() => signOut()}>
          <Icon name="logout" size={15} /> Logout
        </button>
      }
    >
      <div className="form-grid">
        <div className="form-col">
          <Panel title="Account" description="Your Supabase Auth admin account. Passwords are never shown or stored by this site.">
            {accErr && <p className="afield__error">{accErr}</p>}
            {!account && !accErr ? (
              <Skeleton h={120} />
            ) : (
              account && (
                <dl className="kv kv--grid">
                  <div>
                    <dt>Admin email</dt>
                    <dd>{account.email}</dd>
                  </div>
                  <div>
                    <dt>Account status</dt>
                    <dd>
                      {account.email_confirmed_at ? <span className="pill pill--green">Active · email confirmed</span> : <span className="pill">Email not confirmed</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>Owner / admin</dd>
                  </div>
                  <div>
                    <dt>Last login</dt>
                    <dd>{account.last_sign_in_at ? formatDate(account.last_sign_in_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
                  </div>
                  {account.new_email && (
                    <div>
                      <dt>Pending email change</dt>
                      <dd>{account.new_email} — confirm from the email Supabase sent</dd>
                    </div>
                  )}
                </dl>
              )
            )}
          </Panel>

          <Panel title="Password" description="Enter your current password, then choose a new one.">
            <form className="fields" onSubmit={changePassword} noValidate>
              <input type="text" name="username" autoComplete="username" value={account?.email || ''} readOnly hidden />
              <Field label="Current password" htmlFor="pw-cur">
                <input id="pw-cur" className="ainput" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <div className="fields-2">
                <Field label="New password" htmlFor="pw-a">
                  <input id="pw-a" className="ainput" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
                </Field>
                <Field label="Repeat new password" htmlFor="pw-b">
                  <input id="pw-b" className="ainput" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
                </Field>
              </div>
              <p className="afield__hint">At least 8 characters, with letters and numbers.</p>
              {pwErr && (
                <p className="afield__error" role="alert">
                  {pwErr}
                </p>
              )}
              <div>
                <button className="btn btn--blue btn--sm" disabled={pwBusy}>
                  {pwBusy ? <Spinner /> : <Icon name="lock" size={15} />} Change password
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Email" description="Supabase sends a confirmation link; the change applies once it's confirmed.">
            {emailSent && (
              <p className="callout small" role="status">
                <Icon name="mail" size={16} />
                <span>
                  Check <strong>{emailSent}</strong> (and your current inbox) for the confirmation link. Until then you keep signing in with your current email.
                </span>
              </p>
            )}
            <form className="fields" onSubmit={changeEmail} noValidate>
              <div className="fields-2">
                <Field label="New admin email" htmlFor="em-new">
                  <input id="em-new" className="ainput" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Current password" htmlFor="em-pw">
                  <input id="em-pw" className="ainput" type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
                </Field>
              </div>
              {emailErr && (
                <p className="afield__error" role="alert">
                  {emailErr}
                </p>
              )}
              <div>
                <button className="btn btn--ghost btn--sm" disabled={emailBusy}>
                  {emailBusy ? <Spinner /> : <Icon name="mail" size={15} />} Change email
                </button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="form-col form-col--side">
          <Panel title="Session">
            <dl className="kv">
              <div>
                <dt>This session</dt>
                <dd>Signed in on this browser · renews automatically while you're active</dd>
              </div>
              <div>
                <dt>Current access token expires</dt>
                <dd>{expires ? expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
              </div>
              <div>
                <dt>Supabase project</dt>
                <dd className="mono-text">{isConfigured ? SUPABASE_URL.replace(/^https?:\/\//, '') : 'Not configured'}</dd>
              </div>
            </dl>
            <div className="row-gap mt">
              <button className="btn btn--blue btn--sm" onClick={() => signOut()}>
                <Icon name="logout" size={15} /> Logout
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirmGlobal(true)}>
                Log out everywhere
              </button>
            </div>
          </Panel>

          <Panel title="Security" description="Checks, from this browser, that anonymous visitors can't change anything.">
            <ul className="checks checks--static">
              <li className="ok">
                <Icon name="check" size={15} />
                <span>
                  Only your account is authorised
                  <small>Access is granted by the admin_users allow-list in the database — new sign-ups get nothing.</small>
                </span>
              </li>
            </ul>
            <button className="btn btn--ghost btn--sm mt" onClick={check} disabled={checking}>
              {checking ? <Spinner /> : <Icon name="lock" size={15} />} Run security check
            </button>
            {checks && (
              <ul className="checks">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'ok' : 'bad'}>
                    <Icon name={c.ok ? 'check' : 'alert'} size={15} />
                    <span>
                      {c.label}
                      <small>{c.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmGlobal}
        title="Log out everywhere?"
        confirmLabel="Log out everywhere"
        onClose={() => setConfirmGlobal(false)}
        onConfirm={async () => {
          setConfirmGlobal(false);
          await auth.signOut('global');
        }}
        message={<p>This ends your admin session on every browser and device, including this one.</p>}
      />
    </AdminLayout>
  );
}
