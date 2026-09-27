import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Skeleton, Spinner, useToast } from '../components/ui';
import { admin, deleteImageIfUnused, renditionPaths, saveProfile, type UploadedImage } from '../lib/api';
import { BUILT_IN_IMAGES } from '../lib/builtins';
import { storage } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { digitsOnly, isValidEmail, isValidHttpUrl } from '../lib/utils';
import { useAuth } from './auth';
import { Field, ImageField, TextArea, TextInput } from './fields';
import { AdminLayout, LoadFailed, Panel } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

type F = Record<
  'name' | 'title' | 'headline' | 'bio' | 'about' | 'email' | 'phone' | 'whatsapp' | 'location' | 'github' | 'linkedin' | 'website' | 'education_label' | 'focus' | 'goal',
  string
> & { profile_image: string | null; about_image_url: string | null; logo_url: string | null };

const KEYS: (keyof F)[] = ['name', 'title', 'headline', 'bio', 'about', 'email', 'phone', 'whatsapp', 'location', 'github', 'linkedin', 'website', 'education_label', 'focus', 'goal', 'profile_image', 'about_image_url', 'logo_url'];
const IMAGE_KEYS = ['profile_image', 'about_image_url', 'logo_url'] as const;

function toForm(p: Profile | null): F {
  const f = {} as F;
  KEYS.forEach((k) => {
    const v = p ? (p as unknown as Record<string, unknown>)[k] : null;
    (f as Record<string, unknown>)[k] = IMAGE_KEYS.includes(k as (typeof IMAGE_KEYS)[number]) ? (v as string | null) ?? null : ((v as string) ?? '');
  });
  return f;
}

function validate(f: F) {
  const e: Partial<Record<keyof F, string>> = {};
  if (!f.name.trim()) e.name = 'Name is required.';
  if (f.email.trim() && !isValidEmail(f.email)) e.email = 'Enter a valid email address.';
  if (f.phone.trim() && digitsOnly(f.phone).length < 7) e.phone = 'Enter a valid phone number.';
  if (f.whatsapp.trim() && digitsOnly(f.whatsapp).length < 10) e.whatsapp = 'Use international format with country code, e.g. +92 300 1234567';
  (['github', 'linkedin', 'website'] as const).forEach((k) => {
    if (f[k].trim() && !isValidHttpUrl(f[k])) e[k] = 'Enter a full URL starting with https://';
  });
  if (f.bio.length > 400) e.bio = 'Keep the intro under 400 characters.';
  if (f.about.length > 2000) e.about = 'Keep it under 2,000 characters.';
  return e;
}

export function ProfileAdmin() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useLoad(admin.profile);
  const [form, setForm] = useState<F>(toForm(null));
  const [original, setOriginal] = useState<F>(toForm(null));
  const [errors, setErrors] = useState<Partial<Record<keyof F, string>>>({});
  const [saving, setSaving] = useState(false);
  const fresh = useRef<UploadedImage[]>([]);

  useEffect(() => {
    if (loading) return;
    const f = toForm(data);
    setForm(f);
    setOriginal(f);
  }, [data, loading]);

  const set = (k: keyof F, v: string | null) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return toast('Please fix the highlighted fields.', 'error');
    setSaving(true);
    try {
      const patch: Partial<Profile> = {};
      KEYS.forEach((k) => {
        const v = form[k];
        (patch as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() || null : v;
      });
      const saved = await saveProfile(data?.id ?? null, user!.id, patch);
      for (const k of IMAGE_KEYS) if (original[k] && original[k] !== saved[k]) await deleteImageIfUnused(original[k]).catch(() => {});
      const keep = new Set(IMAGE_KEYS.map((k) => saved[k]));
      const orphans = fresh.current.filter((i) => !keep.has(i.url) && i.path);
      fresh.current = [];
      if (orphans.length) await storage.remove(orphans.flatMap((i) => renditionPaths(i.path))).catch(() => {});
      setData(saved);
      markPublicDirty();
      toast('Profile saved — the public site is updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const text = (k: keyof F, label: string, opts: { hint?: string; type?: string; placeholder?: string; max?: number; required?: boolean; inputMode?: 'email' | 'tel' | 'url' } = {}) => (
    <Field label={label} htmlFor={`pf-${k}`} error={errors[k]} hint={opts.hint} required={opts.required}>
      <TextInput id={`pf-${k}`} value={(form[k] as string) || ''} onChange={(v) => set(k, v)} error={errors[k]} type={opts.type} placeholder={opts.placeholder} maxLength={opts.max ?? 160} inputMode={opts.inputMode} />
    </Field>
  );

  const imageBlock = (k: (typeof IMAGE_KEYS)[number], title: string, desc: string, kind: 'profile' | 'logo', ratio: string, fallbackUrl: string) => (
    <Panel title={title} description={desc}>
      <ImageField
        value={form[k]}
        folder={kind === 'logo' ? 'brand' : 'profile'}
        kind={kind}
        ratio={ratio}
        label={title.toLowerCase()}
        onUploaded={(img) => fresh.current.push(img)}
        onChange={(img) => set(k, img?.url ?? null)}
      />
      {!form[k] && (
        <p className="muted small mt-s">
          Empty = the site uses <a href={fallbackUrl} target="_blank" rel="noopener" className="text-link">the provided image</a>.
        </p>
      )}
    </Panel>
  );

  return (
    <AdminLayout title="Profile">
      {error && <LoadFailed message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="form-grid">
          <Skeleton h={420} />
          <Skeleton h={420} />
        </div>
      ) : (
        <form className="form-grid" onSubmit={save} noValidate>
          <div className="form-col">
            <Panel title="Identity" description="Shown in the header, hero and footer.">
              <div className="fields">
                <div className="fields-2">
                  {text('name', 'Name', { required: true, max: 80 })}
                  {text('title', 'Title', { hint: 'Short — e.g. BS Computer Science Student', max: 80 })}
                </div>
                {text('headline', 'Hero headline', { hint: 'The line under your name in the hero.', max: 140 })}
                <Field label="Bio (hero introduction)" htmlFor="pf-bio" error={errors.bio}>
                  <TextArea id="pf-bio" value={form.bio} onChange={(v) => set('bio', v)} rows={3} maxLength={400} error={errors.bio} />
                </Field>
              </div>
            </Panel>
            <Panel title="About section">
              <div className="fields">
                <Field label="About text" htmlFor="pf-about" error={errors.about}>
                  <TextArea id="pf-about" value={form.about} onChange={(v) => set('about', v)} rows={5} maxLength={2000} error={errors.about} />
                </Field>
                <div className="fields-2">
                  {text('education_label', 'Education', { placeholder: 'BS Computer Science', max: 80 })}
                  {text('focus', 'Focus', { placeholder: 'Software Development', max: 80 })}
                  {text('location', 'Location', { placeholder: 'Pakistan', max: 80 })}
                  {text('goal', 'Goal', { placeholder: 'Software Developer / Technology Entrepreneur', max: 120 })}
                </div>
              </div>
            </Panel>
            <Panel title="Contact & links" description="Empty fields are simply hidden on the site.">
              <div className="fields">
                <div className="fields-2">
                  {text('email', 'Email', { type: 'email', inputMode: 'email', max: 120 })}
                  {text('phone', 'Phone', { type: 'tel', inputMode: 'tel', max: 30 })}
                  {text('whatsapp', 'WhatsApp number', { type: 'tel', inputMode: 'tel', hint: 'With country code, e.g. +92 3xx xxxxxxx. Enables the floating WhatsApp button.', max: 30 })}
                  {text('website', 'Website', { type: 'url', inputMode: 'url', placeholder: 'https://…', max: 200 })}
                  {text('github', 'GitHub', { type: 'url', inputMode: 'url', placeholder: 'https://github.com/…', max: 200 })}
                  {text('linkedin', 'LinkedIn', { type: 'url', inputMode: 'url', placeholder: 'https://linkedin.com/in/…', max: 200 })}
                </div>
              </div>
            </Panel>
          </div>
          <div className="form-col form-col--side">
            {imageBlock('profile_image', 'Profile photo', 'Used in the hero (and About, unless set below).', 'profile', '4 / 5', BUILT_IN_IMAGES[0].url)}
            {imageBlock('about_image_url', 'About image', 'Optional — a different photo for the About section.', 'profile', '4 / 5', BUILT_IN_IMAGES[0].url)}
            {imageBlock('logo_url', 'Logo', 'Header, footer and admin. A transparent PNG/WebP works best on the dark theme.', 'logo', '2 / 1', BUILT_IN_IMAGES[1].url)}
            <div className="form-actions">
              <button type="submit" className="btn btn--blue" disabled={saving || !dirty}>
                {saving ? <Spinner /> : <Icon name="check" size={16} />} {saving ? 'Saving…' : 'Save profile'}
              </button>
              <button type="button" className="btn btn--ghost" disabled={saving || !dirty} onClick={() => setForm(original)}>
                Reset
              </button>
            </div>
            {dirty && <p className="muted small unsaved">You have unsaved changes.</p>}
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
