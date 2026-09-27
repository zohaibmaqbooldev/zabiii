import { admin } from '../lib/api';
import type { Experience } from '../lib/types';
import { isValidHttpUrl } from '../lib/utils';
import { CollectionAdmin } from './Collection';
import { Field, TagInput, TextArea, TextInput, Toggle } from './fields';

interface F {
  company: string;
  position: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  technologies: string[];
  company_url: string;
  visible: boolean;
}

export function ExperienceAdmin() {
  return (
    <CollectionAdmin<Experience, F>
      title="Experience"
      table="experience"
      noun="Experience"
      load={admin.experience}
      itemName={(e) => `${e.position} — ${e.company}`}
      searchText={(e) => [e.position, e.company, e.location, ...(e.technologies || [])].join(' ')}
      intro={<p className="muted intro">The Experience section appears on the public site only once at least one visible entry exists.</p>}
      empty={{ icon: 'layers', title: 'No experience added yet.', text: 'Add internships, jobs, freelance or volunteer work when you have them.' }}
      blank={() => ({ company: '', position: '', location: '', start_date: '', end_date: '', is_current: false, description: '', technologies: [], company_url: '', visible: true })}
      toForm={(e) => ({
        company: e.company || '',
        position: e.position || '',
        location: e.location || '',
        start_date: e.start_date || '',
        end_date: e.end_date || '',
        is_current: Boolean(e.is_current),
        description: e.description || '',
        technologies: e.technologies || [],
        company_url: e.company_url || '',
        visible: e.visible !== false,
      })}
      validate={(f) => {
        const e: Partial<Record<keyof F, string>> = {};
        if (!f.position.trim()) e.position = 'Position is required.';
        if (!f.company.trim()) e.company = 'Company / organisation is required.';
        if (f.company_url.trim() && !isValidHttpUrl(f.company_url)) e.company_url = 'Enter a full URL starting with https://';
        if (f.description.length > 2000) e.description = 'Keep it under 2,000 characters.';
        return e;
      }}
      toPayload={(f) => ({
        company: f.company.trim(),
        position: f.position.trim(),
        location: f.location.trim() || null,
        start_date: f.start_date.trim() || null,
        end_date: f.is_current ? null : f.end_date.trim() || null,
        is_current: f.is_current,
        description: f.description.trim() || null,
        technologies: f.technologies,
        company_url: f.company_url.trim() || null,
        visible: f.visible,
      })}
      renderRow={(e) => (
        <div className="crow__text">
          <strong>
            {e.position} · {e.company}
          </strong>
          <small>{[e.location, [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' — ')].filter(Boolean).join(' · ') || '—'}</small>
        </div>
      )}
      renderForm={({ form, set, errors }) => (
        <>
          <div className="fields-2">
            <Field label="Position" htmlFor="x-pos" error={errors.position} required>
              <TextInput id="x-pos" value={form.position} onChange={(v) => set('position', v)} maxLength={100} autoFocus error={errors.position} placeholder="e.g. Web Development Intern" />
            </Field>
            <Field label="Company" htmlFor="x-co" error={errors.company} required>
              <TextInput id="x-co" value={form.company} onChange={(v) => set('company', v)} maxLength={100} error={errors.company} />
            </Field>
          </div>
          <div className="fields-2">
            <Field label="Location" htmlFor="x-loc">
              <TextInput id="x-loc" value={form.location} onChange={(v) => set('location', v)} maxLength={80} placeholder="e.g. Lahore / Remote" />
            </Field>
            <Field label="Company URL" htmlFor="x-url" error={errors.company_url} hint="Optional.">
              <TextInput id="x-url" type="url" inputMode="url" value={form.company_url} onChange={(v) => set('company_url', v)} placeholder="https://…" error={errors.company_url} />
            </Field>
          </div>
          <Toggle checked={form.is_current} onChange={(v) => set('is_current', v)} label="I currently work here" />
          <div className="fields-2">
            <Field label="Start" htmlFor="x-start" hint="e.g. Jun 2026">
              <TextInput id="x-start" value={form.start_date} onChange={(v) => set('start_date', v)} maxLength={30} />
            </Field>
            {!form.is_current && (
              <Field label="End" htmlFor="x-end">
                <TextInput id="x-end" value={form.end_date} onChange={(v) => set('end_date', v)} maxLength={30} />
              </Field>
            )}
          </div>
          <Field label="Description" htmlFor="x-desc" error={errors.description}>
            <TextArea id="x-desc" value={form.description} onChange={(v) => set('description', v)} maxLength={2000} rows={5} error={errors.description} />
          </Field>
          <Field label="Technologies" htmlFor="x-tech" hint="Press Enter or comma to add.">
            <TagInput id="x-tech" value={form.technologies} onChange={(v) => set('technologies', v)} placeholder="React, Python…" />
          </Field>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Published (visible on site)" />
        </>
      )}
    />
  );
}
