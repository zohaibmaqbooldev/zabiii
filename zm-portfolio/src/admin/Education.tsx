import { admin } from '../lib/api';
import type { Education } from '../lib/types';
import { CollectionAdmin } from './Collection';
import { Field, TextArea, TextInput, Toggle } from './fields';

interface F {
  degree: string;
  institution: string;
  field: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  visible: boolean;
}

export function EducationAdmin() {
  return (
    <CollectionAdmin<Education, F>
      title="Education"
      table="education"
      noun="Education entry"
      searchText={(e) => [e.degree, e.institution, e.field].join(' ')}
      load={admin.education}
      itemName={(e) => e.degree}
      empty={{ icon: 'cap', title: 'No education added yet.', text: 'Add your degree and any other studies.' }}
      blank={() => ({ degree: '', institution: '', field: '', location: '', start_date: '', end_date: '', is_current: false, description: '', visible: true })}
      toForm={(e) => ({
        degree: e.degree || '',
        institution: e.institution || '',
        field: e.field || '',
        location: e.location || '',
        start_date: e.start_date || '',
        end_date: e.end_date || '',
        is_current: Boolean(e.is_current),
        description: e.description || '',
        visible: e.visible !== false,
      })}
      validate={(f) => {
        const e: Partial<Record<keyof F, string>> = {};
        if (!f.degree.trim()) e.degree = 'Degree / programme is required.';
        if (f.degree.length > 120) e.degree = 'Keep it under 120 characters.';
        if (f.description.length > 1500) e.description = 'Keep it under 1,500 characters.';
        return e;
      }}
      toPayload={(f) => ({
        degree: f.degree.trim(),
        institution: f.institution.trim() || null,
        field: f.field.trim() || null,
        location: f.location.trim() || null,
        start_date: f.start_date.trim() || null,
        end_date: f.is_current ? null : f.end_date.trim() || null,
        is_current: f.is_current,
        description: f.description.trim() || null,
        visible: f.visible,
      })}
      renderRow={(e) => (
        <div className="crow__text">
          <strong>{e.degree}</strong>
          <small>
            {[e.institution, [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' — ')].filter(Boolean).join(' · ') || (e.is_current ? 'Currently studying' : '—')}
          </small>
        </div>
      )}
      renderForm={({ form, set, errors }) => (
        <>
          <Field label="Degree / programme" htmlFor="e-degree" error={errors.degree} required>
            <TextInput id="e-degree" value={form.degree} onChange={(v) => set('degree', v)} maxLength={120} autoFocus placeholder="e.g. BS Computer Science" error={errors.degree} />
          </Field>
          <Field label="Institution" htmlFor="e-inst">
            <TextInput id="e-inst" value={form.institution} onChange={(v) => set('institution', v)} maxLength={120} />
          </Field>
          <div className="fields-2">
            <Field label="Field of study" htmlFor="e-field">
              <TextInput id="e-field" value={form.field} onChange={(v) => set('field', v)} maxLength={80} />
            </Field>
            <Field label="Location" htmlFor="e-loc">
              <TextInput id="e-loc" value={form.location} onChange={(v) => set('location', v)} maxLength={80} />
            </Field>
          </div>
          <Toggle checked={form.is_current} onChange={(v) => set('is_current', v)} label="Currently studying" />
          <div className="fields-2">
            <Field label="Start" htmlFor="e-start" hint="e.g. 2024 or Sep 2024">
              <TextInput id="e-start" value={form.start_date} onChange={(v) => set('start_date', v)} maxLength={30} />
            </Field>
            {!form.is_current && (
              <Field label="End" htmlFor="e-end">
                <TextInput id="e-end" value={form.end_date} onChange={(v) => set('end_date', v)} maxLength={30} />
              </Field>
            )}
          </div>
          <Field label="Description" htmlFor="e-desc" error={errors.description}>
            <TextArea id="e-desc" value={form.description} onChange={(v) => set('description', v)} maxLength={1500} error={errors.description} />
          </Field>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible on site" />
        </>
      )}
    />
  );
}
