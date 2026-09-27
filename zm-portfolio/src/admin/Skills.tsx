import { admin } from '../lib/api';
import { PROFICIENCY_LABELS, type Skill } from '../lib/types';
import { CollectionAdmin } from './Collection';
import { Field, TextInput, Toggle } from './fields';

interface F {
  name: string;
  category: string;
  proficiency: string; // '' = not rated
  icon: string;
  visible: boolean;
}

const CATEGORIES = ['Programming', 'Web Development', 'Database', 'Tools', 'AI / ML', 'Other'];

export function SkillsAdmin() {
  return (
    <CollectionAdmin<Skill, F>
      title="Skills"
      table="skills"
      noun="Skill"
      searchText={(s) => `${s.name} ${s.category || ''}`}
      load={admin.skills}
      itemName={(s) => s.name}
      empty={{ icon: 'code', title: 'No skills added yet.', text: 'Add the languages, tools and concepts you work with.' }}
      intro={<p className="muted intro">Skills are grouped by category on the site, in this order. Proficiency is optional — unrated skills show without a level.</p>}
      blank={() => ({ name: '', category: '', proficiency: '', icon: '', visible: true })}
      toForm={(s) => ({ name: s.name || '', category: s.category || '', proficiency: s.proficiency ? String(Math.min(5, s.proficiency > 5 ? Math.ceil(s.proficiency / 20) : s.proficiency)) : '', icon: s.icon || '', visible: s.visible !== false })}
      validate={(f) => {
        const e: Partial<Record<keyof F, string>> = {};
        if (!f.name.trim()) e.name = 'Skill name is required.';
        else if (f.name.length > 40) e.name = 'Keep it under 40 characters.';
        if (f.category.length > 40) e.category = 'Keep it under 40 characters.';
        return e;
      }}
      toPayload={(f) => ({ name: f.name.trim(), category: f.category.trim() || null, proficiency: f.proficiency ? Number(f.proficiency) : null, icon: f.icon.trim() || null, visible: f.visible })}
      renderRow={(s) => (
        <div className="crow__text">
          <strong>{s.name}</strong>
          <small>
            {s.category || 'General'}
            {s.proficiency ? ` · ${PROFICIENCY_LABELS[Math.min(5, s.proficiency > 5 ? Math.ceil(s.proficiency / 20) : s.proficiency)] || ''}` : ' · Not rated'}
          </small>
        </div>
      )}
      renderForm={({ form, set, errors }) => (
        <>
          <Field label="Skill name" htmlFor="s-name" error={errors.name} required>
            <TextInput id="s-name" value={form.name} onChange={(v) => set('name', v)} maxLength={40} autoFocus placeholder="e.g. Python" error={errors.name} />
          </Field>
          <Field label="Category" htmlFor="s-cat" error={errors.category} hint="Choose one or type a new category.">
            <input id="s-cat" className="ainput" list="s-cat-list" value={form.category} onChange={(e) => set('category', e.target.value)} maxLength={40} />
            <datalist id="s-cat-list">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Proficiency" htmlFor="s-prof">
            <select id="s-prof" className="ainput" value={form.proficiency} onChange={(e) => set('proficiency', e.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} — {PROFICIENCY_LABELS[n]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icon (optional)" htmlFor="s-icon" hint="A short keyword, e.g. python, react.">
            <TextInput id="s-icon" value={form.icon} onChange={(v) => set('icon', v)} maxLength={30} />
          </Field>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible on site" />
        </>
      )}
    />
  );
}
