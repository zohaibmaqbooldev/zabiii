import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Skeleton, Spinner, useToast } from '../components/ui';
import { admin, saveProfile } from '../lib/api';
import { digitsOnly, isValidEmail, whatsappLink } from '../lib/utils';
import { useAuth } from './auth';
import { Field, TextInput } from './fields';
import { AdminLayout, LoadFailed, Panel } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

type F = { email: string; phone: string; whatsapp: string; location: string };
const EMPTY: F = { email: '', phone: '', whatsapp: '', location: '' };

/** Contact details shown in the Contact section and used by the floating WhatsApp button. */
export function ContactAdmin() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useLoad(admin.profile);
  const [form, setForm] = useState<F>(EMPTY);
  const [original, setOriginal] = useState<F>(EMPTY);
  const [errors, setErrors] = useState<Partial<F>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    const f = { email: data?.email || '', phone: data?.phone || '', whatsapp: data?.whatsapp || '', location: data?.location || '' };
    setForm(f);
    setOriginal(f);
  }, [data, loading]);

  const set = (k: keyof F) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const wa = whatsappLink(form.whatsapp);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const er: Partial<F> = {};
    if (form.email.trim() && !isValidEmail(form.email)) er.email = 'Enter a valid email address.';
    if (form.phone.trim() && digitsOnly(form.phone).length < 7) er.phone = 'Enter a valid phone number.';
    if (form.whatsapp.trim() && digitsOnly(form.whatsapp).length < 10) er.whatsapp = 'Use international format with the country code, e.g. +923456300129';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const saved = await saveProfile(data?.id ?? null, user!.id, {
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        location: form.location.trim() || null,
      });
      setData(saved);
      markPublicDirty();
      toast('Contact information saved');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Contact Information">
      {error && <LoadFailed message={error} onRetry={reload} />}
      {loading && !data ? (
        <Skeleton h={360} />
      ) : (
        <form className="form-grid" onSubmit={save} noValidate>
          <div className="form-col">
            <Panel title="How visitors reach you" description="Empty fields are hidden on the site.">
              <div className="fields">
                <div className="fields-2">
                  <Field label="Email" htmlFor="ct-email" error={errors.email}>
                    <TextInput id="ct-email" type="email" inputMode="email" value={form.email} onChange={set('email')} error={errors.email} maxLength={120} />
                  </Field>
                  <Field label="Phone" htmlFor="ct-phone" error={errors.phone}>
                    <TextInput id="ct-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={30} />
                  </Field>
                </div>
                <Field label="Location" htmlFor="ct-loc">
                  <TextInput id="ct-loc" value={form.location} onChange={set('location')} maxLength={80} />
                </Field>
              </div>
            </Panel>
          </div>
          <div className="form-col form-col--side">
            <Panel title="WhatsApp" description="Powers the floating WhatsApp button on every page.">
              <div className="fields">
                <Field label="WhatsApp number" htmlFor="ct-wa" error={errors.whatsapp} hint="International format with country code. Leave empty to hide the button.">
                  <TextInput id="ct-wa" type="tel" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} maxLength={30} placeholder="+923456300129" />
                </Field>
                <div className="wa-preview">
                  <span className="wa-preview__btn" aria-hidden="true">
                    <Icon name="whatsapp" size={20} />
                  </span>
                  <div>
                    <small className="muted">Button opens</small>
                    <p className="mono-text">{wa || 'Hidden — no valid number'}</p>
                  </div>
                </div>
                {wa && (
                  <a className="btn btn--ghost btn--xs" href={wa} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" size={13} /> Test link
                  </a>
                )}
              </div>
            </Panel>
            <div className="form-actions">
              <button type="submit" className="btn btn--blue" disabled={saving || !dirty}>
                {saving ? <Spinner /> : <Icon name="check" size={16} />} {saving ? 'Saving…' : 'Save contact info'}
              </button>
              <button type="button" className="btn btn--ghost" disabled={saving || !dirty} onClick={() => setForm(original)}>
                Reset
              </button>
            </div>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
