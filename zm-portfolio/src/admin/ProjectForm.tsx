import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Skeleton, Spinner, useToast } from '../components/ui';
import { admin, createProject, deleteImageIfUnused, deleteProject, renditionPaths, updateProject, type ProjectInput, type UploadedImage } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import { storage } from '../lib/supabase';
import type { Project } from '../lib/types';
import { isValidHttpUrl, slugify } from '../lib/utils';
import { Field, ImageField, TagInput, TextArea, TextInput, Toggle } from './fields';
import { AdminLayout, LoadFailed, Panel } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

const EMPTY: ProjectInput = {
  title: '',
  slug: '',
  short_description: '',
  full_description: '',
  image: null,
  image_path: null,
  technologies: [],
  category: '',
  github_url: '',
  live_url: '',
  featured: false,
  published: true,
  display_order: 0,
};

type Errors = Partial<Record<keyof ProjectInput, string>>;

function validate(v: ProjectInput): Errors {
  const e: Errors = {};
  if (!v.title.trim()) e.title = 'Project title is required.';
  else if (v.title.length > 120) e.title = 'Keep the title under 120 characters.';
  if (v.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug)) e.slug = 'Use lowercase letters, numbers and single dashes only.';
  if (!v.short_description?.trim()) e.short_description = 'A short description is required — it appears on project cards.';
  else if (v.short_description.length > 280) e.short_description = 'Keep it under 280 characters.';
  if ((v.full_description || '').length > 8000) e.full_description = 'Keep it under 8,000 characters.';
  if (v.github_url?.trim() && !isValidHttpUrl(v.github_url)) e.github_url = 'Enter a full URL, e.g. https://github.com/you/repo';
  if (v.live_url?.trim() && !isValidHttpUrl(v.live_url)) e.live_url = 'Enter a full URL starting with https://';
  if ((v.category || '').length > 60) e.category = 'Keep the category under 60 characters.';
  if (!Number.isFinite(v.display_order) || v.display_order < 0 || v.display_order > 9999) e.display_order = 'Use a number between 0 and 9999.';
  return e;
}

export function ProjectForm({ id }: { id: string | null }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const isNew = id === null;

  const { data, error, loading, reload } = useLoad(async () => {
    const [project, all, skills] = await Promise.all([id ? admin.project(id) : Promise.resolve(null), admin.projects(), admin.skills()]);
    return { project, all, skills };
  });

  const [form, setForm] = useState<ProjectInput>(EMPTY);
  const [original, setOriginal] = useState<ProjectInput>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** images uploaded during this edit session that aren't saved yet */
  const fresh = useRef<UploadedImage[]>([]);

  useEffect(() => {
    if (!data) return;
    if (data.project) {
      const p = data.project;
      const v: ProjectInput = {
        title: p.title || '',
        slug: p.slug || '',
        short_description: p.short_description || '',
        full_description: p.full_description || '',
        image: p.image,
        image_path: p.image_path,
        technologies: p.technologies || [],
        category: p.category || '',
        github_url: p.github_url || '',
        live_url: p.live_url || '',
        featured: Boolean(p.featured),
        published: p.published !== false,
        display_order: p.display_order ?? 0,
      };
      setForm(v);
      setOriginal(v);
      setSlugTouched(true);
    } else if (isNew) {
      const v = { ...EMPTY, display_order: Math.max(0, ...data.all.map((p) => p.display_order || 0)) + 1 };
      setForm(v);
      setOriginal(v);
    }
  }, [data, isNew]);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  // warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const categories = useMemo(() => [...new Set((data?.all || []).map((p) => p.category?.trim()).filter(Boolean) as string[])], [data]);
  const techSuggestions = useMemo(
    () => [...new Set([...(data?.skills || []).map((s) => s.name), ...(data?.all || []).flatMap((p) => p.technologies || [])])].sort(),
    [data],
  );

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'title' && !slugTouched) next.slug = slugify(String(v));
      return next;
    });
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const discardFresh = async (keep?: string | null) => {
    const orphans = fresh.current.filter((i) => i.url !== keep && i.path);
    fresh.current = [];
    if (orphans.length) await storage.remove(orphans.flatMap((i) => renditionPaths(i.path))).catch(() => {});
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const clean: ProjectInput = {
      ...form,
      title: form.title.trim(),
      slug: (form.slug || slugify(form.title)).trim(),
      short_description: form.short_description?.trim() || '',
      full_description: form.full_description?.trim() || '',
      category: form.category?.trim() || null,
      github_url: form.github_url?.trim() || null,
      live_url: form.live_url?.trim() || null,
      display_order: Number(form.display_order) || 0,
    };
    const errs = validate(clean);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('Please fix the highlighted fields.', 'error');
      document.querySelector<HTMLElement>('.has-error input, .has-error textarea')?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved: Project = isNew ? await createProject(clean) : await updateProject(id!, clean);
      // the old image is no longer referenced by this project: remove it if nothing else uses it
      if (!isNew && original.image && original.image !== saved.image) await deleteImageIfUnused(original.image).catch(() => {});
      await discardFresh(saved.image);
      markPublicDirty();
      toast(isNew ? `“${saved.title}” created${saved.published ? ' and published' : ''}` : 'Changes saved');
      const v = { ...clean, slug: saved.slug };
      setOriginal(v);
      setForm(v);
      navigate('/admin/projects');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (dirty) return setConfirmLeave(true);
    await discardFresh(original.image);
    navigate('/admin/projects');
  };

  const doDelete = async () => {
    if (!data?.project) return;
    setDeleting(true);
    try {
      await deleteProject({ ...data.project, image: original.image });
      await discardFresh(null);
      markPublicDirty();
      toast('Project deleted');
      navigate('/admin/projects');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete', 'error');
      setDeleting(false);
    }
  };

  const title = isNew ? 'New project' : form.title || 'Edit project';

  return (
    <AdminLayout
      title={title}
      back={{ to: '/admin/projects', label: 'Projects' }}
      actions={
        !isNew && data?.project?.published ? (
          <a className="btn btn--ghost btn--sm" href={`/projects/${data.project.slug}`} target="_blank" rel="noopener">
            <Icon name="external" size={15} /> View live
          </a>
        ) : null
      }
    >
      {error && <LoadFailed message={error} onRetry={reload} />}
      {!isNew && data && !data.project && <LoadFailed message="This project no longer exists." onRetry={() => navigate('/admin/projects')} />}

      {loading && !data ? (
        <div className="form-grid">
          <Skeleton h={380} />
          <Skeleton h={380} />
        </div>
      ) : (
        (isNew || data?.project) && (
          <form className="form-grid" onSubmit={save} noValidate>
            <div className="form-col">
              <Panel title="Details">
                <div className="fields">
                  <Field label="Project Title" htmlFor="p-title" error={errors.title} required>
                    <TextInput id="p-title" value={form.title} onChange={(v) => set('title', v)} error={errors.title} maxLength={120} placeholder="e.g. Student Management System" autoFocus={isNew} />
                  </Field>
                  <Field label="Project Slug" htmlFor="p-slug" error={errors.slug} hint={<>Used in the URL: /projects/<strong>{form.slug || 'your-project'}</strong></>}>
                    <TextInput
                      id="p-slug"
                      value={form.slug}
                      onChange={(v) => {
                        setSlugTouched(true);
                        set('slug', v.toLowerCase().replace(/\s+/g, '-'));
                      }}
                      error={errors.slug}
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Short Description" htmlFor="p-short" error={errors.short_description} required hint="One or two sentences for cards and previews.">
                    <TextArea id="p-short" rows={3} value={form.short_description || ''} onChange={(v) => set('short_description', v)} maxLength={280} error={errors.short_description} ai={{ task: 'project_short', context: () => ({ title: form.title, technologies: (form.technologies || []).join(', '), category: form.category || '', related: (form.full_description || '').slice(0, 2000) }) }} />
                  </Field>
                  <Field label="Full Description" htmlFor="p-full" error={errors.full_description} hint="Shown on the project page. Leave a blank line between paragraphs.">
                    <TextArea id="p-full" rows={9} value={form.full_description || ''} onChange={(v) => set('full_description', v)} maxLength={8000} error={errors.full_description} ai={{ task: 'project_full', context: () => ({ title: form.title, technologies: (form.technologies || []).join(', '), category: form.category || '', related: form.short_description || '' }) }} />
                  </Field>
                </div>
              </Panel>

              <Panel title="Stack & links">
                <div className="fields">
                  <Field label="Technologies / Tech Stack" htmlFor="p-tech" hint="Press Enter or comma to add. Backspace removes the last one.">
                    <TagInput id="p-tech" value={form.technologies || []} onChange={(v) => set('technologies', v)} suggestions={techSuggestions} placeholder="C++, React, Python…" />
                  </Field>
                  <Field label="Category" htmlFor="p-cat" error={errors.category} hint="Pick an existing category or type a new one.">
                    <input id="p-cat" className="ainput" list="p-cat-list" value={form.category || ''} onChange={(e) => set('category', e.target.value)} maxLength={60} placeholder="e.g. Web Development" />
                    <datalist id="p-cat-list">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <div className="fields-2">
                    <Field label="GitHub Repository URL" htmlFor="p-gh" error={errors.github_url} hint="Optional — the button is hidden when empty.">
                      <TextInput id="p-gh" type="url" inputMode="url" value={form.github_url || ''} onChange={(v) => set('github_url', v)} error={errors.github_url} placeholder="https://github.com/…" />
                    </Field>
                    <Field label="Live Demo URL" htmlFor="p-live" error={errors.live_url} hint="Optional — the button is hidden when empty.">
                      <TextInput id="p-live" type="url" inputMode="url" value={form.live_url || ''} onChange={(v) => set('live_url', v)} error={errors.live_url} placeholder="https://…" />
                    </Field>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="form-col form-col--side">
              <Panel title="Project Image" description="Shown on cards, in Featured and on the project page.">
                <ImageField
                  value={form.image}
                  kind="project"
                  folder="projects"
                  label="project image"
                  onUploaded={(img) => fresh.current.push(img)}
                  onChange={(img) => {
                    set('image', img?.url ?? null);
                    set('image_path', img?.path || null);
                  }}
                />
              </Panel>

              <Panel title="Visibility">
                <div className="fields">
                  <Toggle checked={form.published} onChange={(v) => set('published', v)} label="Published" description="Visible on the public portfolio." />
                  <Toggle checked={form.featured} onChange={(v) => set('featured', v)} label="Featured" description="Spotlighted in the Featured Projects section." />
                  <Field label="Display Order" htmlFor="p-order" error={errors.display_order} hint="Lower numbers appear first.">
                    <input id="p-order" className="ainput" type="number" min={0} max={9999} value={form.display_order} onChange={(e) => set('display_order', Number(e.target.value))} aria-invalid={Boolean(errors.display_order)} />
                  </Field>
                </div>
              </Panel>

              <div className="form-actions">
                <button type="submit" className="btn btn--blue" disabled={saving}>
                  {saving ? <Spinner /> : <Icon name="check" size={16} />} {saving ? 'Saving…' : isNew ? 'Create project' : 'Save changes'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={cancel} disabled={saving}>
                  Cancel
                </button>
                {!isNew && (
                  <button type="button" className="btn btn--ghost danger form-actions__delete" onClick={() => setConfirmDelete(true)} disabled={saving}>
                    <Icon name="trash" size={15} /> Delete
                  </button>
                )}
              </div>
              {dirty && <p className="muted small unsaved">You have unsaved changes.</p>}
            </div>
          </form>
        )
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete project"
        confirmLabel="Delete Project"
        busy={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        message={
          <p>
            Are you sure you want to delete this project? <strong>{form.title}</strong> will be removed from the portfolio permanently.
          </p>
        }
      />
      <ConfirmDialog
        open={confirmLeave}
        title="Discard changes?"
        confirmLabel="Discard"
        onClose={() => setConfirmLeave(false)}
        onConfirm={async () => {
          setConfirmLeave(false);
          await discardFresh(original.image);
          setOriginal(form); // silence the unload guard
          navigate('/admin/projects');
        }}
        message={<p>You have unsaved changes to this project. Leave without saving?</p>}
      />
      <p className="sr-only">
        <Link to="/admin/projects">Back to projects</Link>
      </p>
    </AdminLayout>
  );
}
