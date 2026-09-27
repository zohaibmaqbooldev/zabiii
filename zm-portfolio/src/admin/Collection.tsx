import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Dialog, EmptyState, Skeleton, Spinner, useToast } from '../components/ui';
import { deleteImageIfUnused, move, renditionPaths, saveOrder, type UploadedImage } from '../lib/api';
import { db, storage } from '../lib/supabase';
import { cx } from '../lib/utils';
import { AdminLayout, LoadFailed } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

interface Row {
  id: string;
  display_order: number;
  visible?: boolean | null;
}

export interface FormApi<F> {
  form: F;
  set: <K extends keyof F>(k: K, v: F[K]) => void;
  errors: Partial<Record<keyof F, string>>;
  /** register an image uploaded while the dialog is open (for cleanup on cancel) */
  trackUpload: (img: UploadedImage) => void;
}

/**
 * Generic CRUD screen: list with reorder / show-hide / edit / delete, plus an
 * add/edit dialog. Used by Skills, Education, Certificates and Social Links.
 */
export function CollectionAdmin<T extends Row, F extends object>({
  title,
  table,
  noun,
  load,
  empty,
  toForm,
  blank,
  validate,
  toPayload,
  renderRow,
  renderForm,
  imageKey,
  intro,
  itemName,
  searchText,
}: {
  title: string;
  table: string;
  noun: string;
  load: () => Promise<T[]>;
  empty: { icon: string; title: string; text: string };
  toForm: (row: T) => F;
  blank: () => F;
  validate: (f: F) => Partial<Record<keyof F, string>>;
  toPayload: (f: F) => Partial<T>;
  renderRow: (row: T) => ReactNode;
  renderForm: (api: FormApi<F>) => ReactNode;
  /** name of the image column, so replaced/deleted images get cleaned up */
  imageKey?: keyof T & string;
  intro?: ReactNode;
  itemName: (row: T) => string;
  /** enables the search box */
  searchText?: (row: T) => string;
}) {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(load);
  const list = data || [];
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [form, setForm] = useState<F>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof F, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const fresh = useRef<UploadedImage[]>([]);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q && searchText ? list.filter((r) => searchText(r).toLowerCase().includes(q)) : list;

  const open = (row: T | 'new') => {
    setEditing(row);
    setForm(row === 'new' ? blank() : toForm(row));
    setErrors({});
    fresh.current = [];
  };
  const discardFresh = async (keep?: unknown) => {
    const orphans = fresh.current.filter((i) => i.url !== keep && i.path);
    fresh.current = [];
    if (orphans.length) await storage.remove(orphans.flatMap((i) => renditionPaths(i.path))).catch(() => {});
  };
  const close = async () => {
    if (saving) return;
    const keep = editing && editing !== 'new' && imageKey ? editing[imageKey] : null;
    setEditing(null);
    await discardFresh(keep);
  };

  const api: FormApi<F> = {
    form,
    errors,
    set: (k, v) => {
      setForm((f) => ({ ...f, [k]: v }));
      setErrors((e) => ({ ...e, [k]: undefined }));
    },
    trackUpload: (img) => fresh.current.push(img),
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing === 'new') {
        const order = Math.max(0, ...list.map((r) => r.display_order || 0)) + 1;
        const [row] = await db.insert<T>(table, { ...payload, display_order: order } as Partial<T>);
        setData([...list, row]);
        await discardFresh(imageKey ? row[imageKey] : null);
        toast(`${noun} added`);
      } else if (editing) {
        const [row] = await db.update<T>(table, { id: editing.id }, payload);
        setData(list.map((r) => (r.id === row.id ? row : r)));
        if (imageKey && editing[imageKey] && editing[imageKey] !== row[imageKey]) await deleteImageIfUnused(editing[imageKey] as string).catch(() => {});
        await discardFresh(imageKey ? row[imageKey] : null);
        toast(`${noun} updated`);
      }
      markPublicDirty();
      setEditing(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await db.remove(table, { id: confirm.id });
      if (imageKey) await deleteImageIfUnused(confirm[imageKey] as string | null).catch(() => {});
      setData(list.filter((r) => r.id !== confirm.id));
      markPublicDirty();
      toast(`${noun} deleted`);
      setConfirm(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const reorder = async (i: number, dir: -1 | 1) => {
    const before = list;
    const next = move(list, i, dir);
    if (next === list) return;
    setData(next.map((r, j) => ({ ...r, display_order: j + 1 })));
    setBusy(true);
    try {
      await saveOrder(table, next.map((r) => r.id), before);
      markPublicDirty();
    } catch (err) {
      setData(before);
      toast(err instanceof Error ? err.message : 'Could not reorder', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisible = async (row: T) => {
    const before = list;
    const visible = row.visible === false;
    setData(list.map((r) => (r.id === row.id ? { ...r, visible } : r)));
    try {
      await db.update<T>(table, { id: row.id }, { visible } as Partial<T>);
      markPublicDirty();
      toast(visible ? `${noun} shown on the site` : `${noun} hidden from the site`);
    } catch (err) {
      setData(before);
      toast(err instanceof Error ? err.message : 'Could not update', 'error');
    }
  };

  return (
    <AdminLayout
      title={title}
      actions={
        <button className="btn btn--blue btn--sm" onClick={() => open('new')}>
          <Icon name="plus" size={16} /> Add {noun.toLowerCase()}
        </button>
      }
    >
      {intro}
      {error && <LoadFailed message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="clist">
          {[0, 1, 2].map((i) => (
            <div className="crow" key={i}>
              <Skeleton w="40%" h={18} />
            </div>
          ))}
        </div>
      ) : list.length === 0 && !error ? (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          text={empty.text}
          action={
            <button className="btn btn--blue btn--sm" onClick={() => open('new')}>
              <Icon name="plus" size={16} /> Add {noun.toLowerCase()}
            </button>
          }
        />
      ) : (
        <>
        {searchText && list.length > 4 && (
          <label className="search admin-search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search {title.toLowerCase()}</span>
            <input type="search" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
        {q && shown.length === 0 && <p className="muted">Nothing matches “{query}”.</p>}
        <ol className="clist">
          {shown.map((row) => {
            const i = list.indexOf(row);
            return (
            <li key={row.id} className={cx('crow', row.visible === false && 'is-hidden')}>
              <div className="crow__order">
                <button className="icon-btn sm" onClick={() => reorder(i, -1)} disabled={i === 0 || busy || Boolean(q)} aria-label={`Move ${itemName(row)} up`}>
                  <Icon name="arrow-up" size={15} />
                </button>
                <button className="icon-btn sm" onClick={() => reorder(i, 1)} disabled={i === list.length - 1 || busy || Boolean(q)} aria-label={`Move ${itemName(row)} down`}>
                  <Icon name="arrow-down" size={15} />
                </button>
              </div>
              <div className="crow__main">{renderRow(row)}</div>
              <div className="crow__actions">
                {'visible' in row && (
                  <button className={cx('pill pill--btn', row.visible !== false && 'pill--green')} onClick={() => toggleVisible(row)} aria-pressed={row.visible !== false}>
                    <Icon name={row.visible !== false ? 'eye' : 'eye-off'} size={13} /> {row.visible !== false ? 'Visible' : 'Hidden'}
                  </button>
                )}
                <button className="btn btn--ghost btn--xs" onClick={() => open(row)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button className="btn btn--ghost btn--xs danger" onClick={() => setConfirm(row)} aria-label={`Delete ${itemName(row)}`}>
                  <Icon name="trash" size={14} />
                  <span className="hide-xs">Delete</span>
                </button>
              </div>
            </li>
            );
          })}
        </ol>
        </>
      )}

      <Dialog
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? `Add ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="collection-form" className="btn btn--blue" disabled={saving}>
              {saving ? <Spinner /> : <Icon name="check" size={16} />} {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="collection-form" onSubmit={save} noValidate className="fields">
          {renderForm(api)}
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`Delete ${noun.toLowerCase()}`}
        busy={deleting}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        message={
          <p>
            Are you sure you want to delete this? <strong>{confirm ? itemName(confirm) : ''}</strong> will be removed permanently.
          </p>
        }
      />
    </AdminLayout>
  );
}
