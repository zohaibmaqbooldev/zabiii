import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { ConfirmDialog, EmptyState, Skeleton, useToast } from '../components/ui';
import { admin, deleteProject, duplicateProject, move, saveOrder, updateProject } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import type { Project } from '../lib/types';
import { cx, formatDate, safeUrl } from '../lib/utils';
import { AdminLayout, LoadFailed } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

export function ProjectsAdmin() {
  const toast = useToast();
  const { navigate } = useRouter();
  const { data, setData, error, loading, reload } = useLoad(admin.projects);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'published' | 'hidden' | 'featured'>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const list = data || [];
  const shown = useMemo(
    () =>
      list
        .filter((p) => (filter === 'all' ? true : filter === 'published' ? p.published : filter === 'hidden' ? !p.published : p.featured))
        .filter((p) => !q || [p.title, p.category, ...(p.technologies || [])].join(' ').toLowerCase().includes(q)),
    [list, filter, q],
  );

  /** optimistic update with rollback */
  const patch = async (p: Project, change: Partial<Project>, msg: string) => {
    const before = list;
    setData(list.map((x) => (x.id === p.id ? { ...x, ...change } : x)));
    setBusy(p.id);
    try {
      await updateProject(p.id, change);
      markPublicDirty();
      toast(msg);
    } catch (e) {
      setData(before);
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const reorder = async (index: number, dir: -1 | 1) => {
    const before = list;
    const next = move(list, index, dir);
    if (next === list) return;
    setData(next.map((p, i) => ({ ...p, display_order: i + 1 })));
    setBusy('order');
    try {
      await saveOrder('projects', next.map((p) => p.id), before);
      markPublicDirty();
      toast('Order updated');
    } catch (e) {
      setData(before);
      toast(e instanceof Error ? e.message : 'Could not reorder', 'error');
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (p: Project) => {
    setBusy(p.id);
    try {
      const copy = await duplicateProject(p, Math.max(0, ...list.map((x) => x.display_order || 0)) + 1);
      setData([...list, copy]);
      markPublicDirty();
      toast(`Duplicated as “${copy.title}” (hidden until you publish it)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not duplicate', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await deleteProject(confirm);
      setData(list.filter((p) => p.id !== confirm.id));
      markPublicDirty();
      toast(`“${confirm.title}” deleted`);
      setConfirm(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout
      title="Projects"
      actions={
        <Link to="/admin/projects/new" className="btn btn--blue btn--sm">
          <Icon name="plus" size={16} /> Add New Project
        </Link>
      }
    >
      {error && <LoadFailed message={error} onRetry={reload} />}

      {list.length > 0 && (
        <div className="list-toolbar">
          <div className="segmented" role="group" aria-label="Filter projects">
            {(['all', 'published', 'hidden', 'featured'] as const).map((f) => (
              <button key={f} className={cx('segmented__btn', filter === f && 'is-active')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
                <span className="count">
                  {f === 'all' ? list.length : f === 'published' ? list.filter((p) => p.published).length : f === 'hidden' ? list.filter((p) => !p.published).length : list.filter((p) => p.featured).length}
                </span>
              </button>
            ))}
          </div>
          <label className="search admin-search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search projects</span>
            <input type="search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      )}

      {loading && !data ? (
        <div className="plist">
          {[0, 1, 2].map((i) => (
            <div className="prow" key={i}>
              <Skeleton h={64} w={100} />
              <div>
                <Skeleton w="50%" h={18} />
                <Skeleton w="30%" className="mt-s" />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 && !error ? (
        <EmptyState
          icon="folder"
          title="No projects added yet."
          text="Create your first project — it appears on the public portfolio as soon as it's published."
          action={
            <Link to="/admin/projects/new" className="btn btn--blue btn--sm">
              <Icon name="plus" size={16} /> Add New Project
            </Link>
          }
        />
      ) : (
        <ol className="plist" aria-label="Projects">
          <li className="prow prow--head" aria-hidden="true">
            <span>Image</span>
            <span>Project</span>
            <span>Status</span>
            <span>Links</span>
            <span>Order</span>
            <span>Actions</span>
          </li>
          {shown.map((p) => {
            const index = list.indexOf(p);
            const isBusy = busy === p.id;
            return (
              <li key={p.id} className={cx('prow', !p.published && 'is-hidden', isBusy && 'is-busy')}>
                <Link to={`/admin/projects/${p.id}`} className="prow__img" tabIndex={-1} aria-hidden="true">
                  <SmartImage src={p.image} alt="" ratio="16 / 10" sizes="120px" fallbackLabel="No image" />
                </Link>
                <div className="prow__main">
                  <Link to={`/admin/projects/${p.id}`} className="prow__title">
                    {p.title}
                  </Link>
                  <p className="prow__meta">
                    {p.category || 'Uncategorised'}
                    {(p.technologies || []).length > 0 && <> · {(p.technologies || []).join(', ')}</>}
                  </p>
                  <p className="prow__date">Created {formatDate(p.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="prow__status">
                  <button className={cx('pill pill--btn', p.published && 'pill--green')} onClick={() => patch(p, { published: !p.published }, p.published ? 'Unpublished — hidden from the site' : 'Published — now live')} disabled={isBusy} aria-pressed={p.published} title={p.published ? 'Click to hide from the public site' : 'Click to publish'}>
                    <Icon name={p.published ? 'eye' : 'eye-off'} size={13} /> {p.published ? 'Published' : 'Hidden'}
                  </button>
                  <button className={cx('pill pill--btn', p.featured && 'pill--blue')} onClick={() => patch(p, { featured: !p.featured }, p.featured ? 'Removed from Featured' : 'Added to Featured')} disabled={isBusy} aria-pressed={p.featured} title={p.featured ? 'Click to unfeature' : 'Click to feature'}>
                    <Icon name="star" size={13} /> {p.featured ? 'Featured' : 'Not featured'}
                  </button>
                </div>
                <div className="prow__links">
                  <span className={cx('linkflag', safeUrl(p.github_url) && 'is-on')} title={p.github_url || 'No GitHub URL'}>
                    <Icon name="github" size={14} /> GitHub
                  </span>
                  <span className={cx('linkflag', safeUrl(p.live_url) && 'is-on')} title={p.live_url || 'No live demo URL'}>
                    <Icon name="globe" size={14} /> Live
                  </span>
                </div>
                <div className="prow__order">
                  <span className="mono">#{index + 1}</span>
                  <button className="icon-btn sm" onClick={() => reorder(index, -1)} disabled={index === 0 || busy !== null || filter !== 'all' || Boolean(q)} aria-label={`Move ${p.title} up`}>
                    <Icon name="arrow-up" size={15} />
                  </button>
                  <button className="icon-btn sm" onClick={() => reorder(index, 1)} disabled={index === list.length - 1 || busy !== null || filter !== 'all' || Boolean(q)} aria-label={`Move ${p.title} down`}>
                    <Icon name="arrow-down" size={15} />
                  </button>
                </div>
                <div className="prow__actions">
                  <button className="btn btn--ghost btn--xs" onClick={() => navigate(`/admin/projects/${p.id}`)}>
                    <Icon name="edit" size={14} /> Edit
                  </button>
                  <button className="btn btn--ghost btn--xs" onClick={() => duplicate(p)} disabled={isBusy}>
                    <Icon name="duplicate" size={14} /> Duplicate
                  </button>
                  <button className="btn btn--ghost btn--xs danger" onClick={() => setConfirm(p)} disabled={isBusy}>
                    <Icon name="trash" size={14} /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete project"
        confirmLabel="Delete Project"
        busy={deleting}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        message={
          <>
            <p>
              Are you sure you want to delete this project? <strong>{confirm?.title}</strong> will be removed from the portfolio permanently.
            </p>
            <p className="small muted">Its uploaded image is also removed from storage unless another project still uses it.</p>
          </>
        }
      />
    </AdminLayout>
  );
}
