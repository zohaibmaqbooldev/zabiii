import { SmartImage } from '../components/SmartImage';
import { admin } from '../lib/api';
import type { Certificate } from '../lib/types';
import { formatDate, isValidHttpUrl } from '../lib/utils';
import { CollectionAdmin } from './Collection';
import { Field, ImageField, TextInput, Toggle } from './fields';

interface F {
  title: string;
  issuer: string;
  issue_date: string;
  image: string | null;
  image_path: string | null;
  credential_url: string;
  visible: boolean;
}

export function CertificatesAdmin() {
  return (
    <CollectionAdmin<Certificate, F>
      title="Certificates"
      table="certificates"
      noun="Certificate"
      searchText={(c) => [c.title, c.issuer].join(' ')}
      load={admin.certificates}
      imageKey="image"
      itemName={(c) => c.title}
      empty={{ icon: 'award', title: 'No certificates added yet.', text: 'Add certificates as you earn them — the public section shows a tidy empty state until then.' }}
      blank={() => ({ title: '', issuer: '', issue_date: '', image: null, image_path: null, credential_url: '', visible: true })}
      toForm={(c) => ({
        title: c.title || '',
        issuer: c.issuer || '',
        issue_date: c.issue_date || '',
        image: c.image,
        image_path: c.image_path,
        credential_url: c.credential_url || '',
        visible: c.visible !== false,
      })}
      validate={(f) => {
        const e: Partial<Record<keyof F, string>> = {};
        if (!f.title.trim()) e.title = 'Certificate title is required.';
        if (f.title.length > 140) e.title = 'Keep it under 140 characters.';
        if (f.credential_url.trim() && !isValidHttpUrl(f.credential_url)) e.credential_url = 'Enter a full URL starting with https://';
        return e;
      }}
      toPayload={(f) => ({
        title: f.title.trim(),
        issuer: f.issuer.trim() || null,
        issue_date: f.issue_date || null,
        image: f.image,
        image_path: f.image_path,
        credential_url: f.credential_url.trim() || null,
        visible: f.visible,
      })}
      renderRow={(c) => (
        <div className="crow__with-img">
          <SmartImage src={c.image} alt="" ratio="4 / 3" className="crow__img" sizes="80px" fallbackLabel="No image" />
          <div className="crow__text">
            <strong>{c.title}</strong>
            <small>{[c.issuer, c.issue_date && formatDate(c.issue_date)].filter(Boolean).join(' · ') || '—'}</small>
          </div>
        </div>
      )}
      renderForm={({ form, set, errors, trackUpload }) => (
        <>
          <Field label="Certificate title" htmlFor="c-title" error={errors.title} required>
            <TextInput id="c-title" value={form.title} onChange={(v) => set('title', v)} maxLength={140} autoFocus error={errors.title} />
          </Field>
          <div className="fields-2">
            <Field label="Issuer" htmlFor="c-issuer">
              <TextInput id="c-issuer" value={form.issuer} onChange={(v) => set('issuer', v)} maxLength={100} />
            </Field>
            <Field label="Issue date" htmlFor="c-date">
              <input id="c-date" type="date" className="ainput" value={/^\d{4}-\d{2}-\d{2}$/.test(form.issue_date) ? form.issue_date : ''} onChange={(e) => set('issue_date', e.target.value)} />
            </Field>
          </div>
          <Field label="Certificate URL" htmlFor="c-url" error={errors.credential_url} hint="Optional link to verify the credential.">
            <TextInput id="c-url" type="url" inputMode="url" value={form.credential_url} onChange={(v) => set('credential_url', v)} placeholder="https://…" error={errors.credential_url} />
          </Field>
          <Field label="Certificate image">
            <ImageField
              value={form.image}
              folder="certificates"
              kind="certificate"
              ratio="4 / 3"
              label="certificate image"
              onUploaded={trackUpload}
              onChange={(img) => {
                set('image', img?.url ?? null);
                set('image_path', img?.path || null);
              }}
            />
          </Field>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible on site" />
        </>
      )}
    />
  );
}
