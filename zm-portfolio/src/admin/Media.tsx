import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { ConfirmDialog, Dialog, EmptyState, Skeleton, Spinner, useToast } from '../components/ui';
import { admin, findImageUsage, renditionPaths, saveProfile, uploadImage } from '../lib/api';
import { BUILT_IN_IMAGES } from '../lib/builtins';
import { ACCEPT_ATTR, validateImage } from '../lib/image';
import { db, storage } from '../lib/supabase';
import type { Certificate, Profile, Project } from '../lib/types';
import { formatDate } from '../lib/utils';
import { useAuth } from './auth';
import { listAllMedia } from './fields';
import { AdminLayout, LoadFailed, Panel } from './Layout';
import { markPublicDirty, useLoad } from './useLoad';

interface Item {
  path: string;
  url: string;
  size?: number;
  date?: string;
  uses: string[];
}

async function loadMedia() {
  const [files, projects, certs, profile] = await Promise.all([listAllMedia(), admin.projects(), admin.certificates(), admin.profile()]);
  const usage = (url: string) => {
    const u: string[] = [];
    projects.filter((p) => p.image === url).forEach((p) => u.push(`Project: ${p.title}`));
    certs.filter((c) => c.image === url).forEach((c) => u.push(`Certificate: ${c.title}`));
    if (profile?.profile_image === url) u.push('Profile photo');
    if (profile?.about_image_url === url) u.push('About image');
    if (profile?.logo_url === url) u.push('Logo');
    return u;
  };
  const items: Item[] = files.map((f) => ({ path: f.path, url: f.url, size: f.obj.metadata?.size, date: f.obj.created_at, uses: usage(f.url) }));
  const builtIns = BUILT_IN_IMAGES.map((b) => ({ ...b, uses: usage(b.url).concat(b.key === 'profile' && !profile?.profile_image ? ['Profile photo (default)'] : b.key === 'logo' && !profile?.logo_url ? ['Logo (default)'] : []) }));
  return { items, builtIns, projects, certs, profile };
}

/** Point every reference to `from` at `to`. */
async function repoint(from: string, to: string, ctx: { projects: Project[]; certs: Certificate[]; profile: Profile | null }, userId: string) {
  await Promise.all([
    ...ctx.projects.filter((p) => p.image === from).map((p) => db.update('projects', { id: p.id }, { image: to, image_path: null })),
    ...ctx.certs.filter((c) => c.image === from).map((c) => db.update('certificates', { id: c.id }, { image: to, image_path: null })),
  ]);
  const p = ctx.profile;
  if (p) {
    const patch: Partial<Profile> = {};
    if (p.profile_image === from) patch.profile_image = to;
    if (p.about_image_url === from) patch.about_image_url = to;
    if (p.logo_url === from) patch.logo_url = to;
    if (Object.keys(patch).length) await saveProfile(p.id, userId, patch);
  }
}

export function MediaAdmin() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(loadMedia);
  const upInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [replacing, setReplacing] = useState<Item | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{ item: Item; file: File } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const totalSize = useMemo(() => (data?.items || []).reduce((s, i) => s + (i.size || 0), 0), [data]);

  const upload = async (file?: File) => {
    if (!file) return;
    const err = validateImage(file);
    if (err) return toast(err, 'error');
    setProgress(0);
    try {
      await uploadImage(file, 'media', 'media', setProgress);
      toast('Image uploaded to portfolio-images');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setProgress(null);
      if (upInput.current) upInput.current.value = '';
    }
  };

  const doReplace = async () => {
    if (!confirmReplace || !data) return;
    const { item, file } = confirmReplace;
    setBusy(true);
    setProgress(0);
    try {
      const folder = item.path.split('/')[0] || 'media';
      const kind = folder === 'brand' ? 'logo' : folder === 'profile' ? 'profile' : folder === 'certificates' ? 'certificate' : 'project';
      const img = await uploadImage(file, folder, kind, setProgress);
      await repoint(item.url, img.url, data, user!.id);
      await storage.remove(renditionPaths(item.path)).catch(() => {});
      markPublicDirty();
      toast(item.uses.length ? `Replaced everywhere it was used (${item.uses.length})` : 'Image replaced');
      setConfirmReplace(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Replace failed', 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const uses = await findImageUsage(confirmDelete.url); // re-check right before deleting
      if (uses.length) {
        toast(`Still in use (${uses.join(', ')}) — not deleted.`, 'error');
      } else {
        await storage.remove(renditionPaths(confirmDelete.path));
        toast('Image deleted');
      }
      setConfirmDelete(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const useAs = async (url: string, key: 'profile_image' | 'about_image_url' | 'logo_url', label: string) => {
    setBusy(true);
    try {
      await saveProfile(data?.profile?.id ?? null, user!.id, { [key]: url });
      markPublicDirty();
      toast(`Set as ${label}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update profile', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Copy the four provided images into the bucket and point the site at the stored copies. */
  const importBuiltIns = async () => {
    if (!data) return;
    setImporting(true);
    try {
      for (const b of BUILT_IN_IMAGES) {
        const [lg, sm] = await Promise.all([fetch(b.url).then((r) => r.blob()), fetch(b.small).then((r) => r.blob())]);
        const base = `provided/${b.key}-${Date.now().toString(36)}`;
        const url = await storage.upload(`${base}-lg.webp`, new Blob([lg], { type: 'image/webp' }));
        await storage.upload(`${base}-sm.webp`, new Blob([sm], { type: 'image/webp' }));
        await repoint(b.url, url, data, user!.id);
        if (b.key === 'profile' && !data.profile?.profile_image) await saveProfile(data.profile?.id ?? null, user!.id, { profile_image: url });
        if (b.key === 'logo' && !data.profile?.logo_url) await saveProfile(data.profile?.id ?? null, user!.id, { logo_url: url });
        // refresh profile id after a first save
        data.profile = await admin.profile();
      }
      markPublicDirty();
      toast('Provided images copied to Supabase Storage and connected');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const builtInsInUse = data?.builtIns.some((b) => b.uses.length) ?? false;

  return (
    <AdminLayout
      title="Media"
      actions={
        <>
          <button className="btn btn--blue btn--sm" onClick={() => upInput.current?.click()} disabled={progress !== null}>
            {progress !== null ? <Spinner /> : <Icon name="upload" size={16} />} {progress !== null ? `Uploading ${progress}%` : 'Upload image'}
          </button>
          <input ref={upInput} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => upload(e.target.files?.[0])} />
          <input
            ref={replaceInput}
            type="file"
            accept={ACCEPT_ATTR}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !replacing) return;
              const err = validateImage(f);
              if (err) return toast(err, 'error');
              setConfirmReplace({ item: replacing, file: f });
            }}
          />
        </>
      }
    >
      {error && <LoadFailed message={error} onRetry={reload} />}

      <Panel
        title="Provided images"
        description="The four images you supplied, optimised and shipped with the site."
        actions={
          builtInsInUse ? (
            <button className="btn btn--ghost btn--sm" onClick={importBuiltIns} disabled={importing}>
              {importing ? <Spinner /> : <Icon name="upload" size={15} />} Copy into Supabase Storage
            </button>
          ) : null
        }
      >
        <div className="media-grid">
          {BUILT_IN_IMAGES.map((b) => {
            const uses = data?.builtIns.find((x) => x.key === b.key)?.uses || [];
            return (
              <figure key={b.key} className="media-card">
                <SmartImage src={b.url} alt={b.label} ratio="4 / 3" sizes="260px" className={b.key === 'logo' ? 'is-contain' : ''} />
                <figcaption>
                  <strong>{b.label}</strong>
                  <small>{uses.length ? uses.join(' · ') : 'Not in use'}</small>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="portfolio-images bucket"
        description={data ? `${data.items.length} image${data.items.length === 1 ? '' : 's'} · ${(totalSize / 1024 / 1024).toFixed(1)} MB (large renditions)` : undefined}
      >
        {loading && !data ? (
          <div className="media-grid">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={220} />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState icon="image" title="No uploads yet." text="Images you upload for projects, certificates or your profile are stored here." />
        ) : (
          <div className="media-grid">
            {data?.items.map((m) => (
              <figure key={m.path} className="media-card">
                <button className="media-card__img" onClick={() => setPreview(m)} aria-label={`Preview ${m.path}`}>
                  <SmartImage src={m.url} alt="" ratio="4 / 3" sizes="260px" className={m.path.startsWith('brand/') || m.path.includes('/logo') ? 'is-contain' : ''} />
                </button>
                <figcaption>
                  <strong title={m.path}>{m.path}</strong>
                  <small>
                    {m.size ? `${Math.round(m.size / 1024)} KB · ` : ''}
                    {m.date ? formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </small>
                  <span className={m.uses.length ? 'pill pill--green' : 'pill'}>{m.uses.length ? `In use: ${m.uses.join(', ')}` : 'Unused'}</span>
                </figcaption>
                <div className="media-card__actions">
                  <button
                    className="btn btn--ghost btn--xs"
                    onClick={() => {
                      navigator.clipboard?.writeText(m.url).then(() => toast('URL copied'), () => toast('Copy failed', 'error'));
                    }}
                  >
                    <Icon name="copy" size={13} /> URL
                  </button>
                  <button
                    className="btn btn--ghost btn--xs"
                    onClick={() => {
                      setReplacing(m);
                      replaceInput.current?.click();
                    }}
                    disabled={busy}
                  >
                    <Icon name="refresh" size={13} /> Replace
                  </button>
                  <button
                    className="btn btn--ghost btn--xs danger"
                    onClick={() => setConfirmDelete(m)}
                    disabled={busy || m.uses.length > 0}
                    title={m.uses.length ? 'In use — replace it or change it where it is used first' : 'Delete'}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        )}
      </Panel>

      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.path || 'Preview'} size="lg" className="lightbox">
        {preview && (
          <>
            <SmartImage src={preview.url} alt={preview.path} className="lightbox__img" sizes="880px" />
            <div className="preview-actions">
              <span className="muted small">{preview.uses.length ? `In use: ${preview.uses.join(', ')}` : 'Not used anywhere yet.'}</span>
              <div className="row-gap">
                <button className="btn btn--ghost btn--xs" disabled={busy} onClick={() => useAs(preview.url, 'profile_image', 'profile photo')}>
                  Use as profile photo
                </button>
                <button className="btn btn--ghost btn--xs" disabled={busy} onClick={() => useAs(preview.url, 'about_image_url', 'About image')}>
                  Use as About image
                </button>
                <button className="btn btn--ghost btn--xs" disabled={busy} onClick={() => useAs(preview.url, 'logo_url', 'logo')}>
                  Use as logo
                </button>
              </div>
            </div>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmReplace)}
        title="Replace image?"
        confirmLabel={busy ? `Replacing ${progress ?? 0}%` : 'Replace'}
        busy={busy}
        onClose={() => setConfirmReplace(null)}
        onConfirm={doReplace}
        message={
          <p>
            <strong>{confirmReplace?.item.path}</strong> will be overwritten with <strong>{confirmReplace?.file.name}</strong>
            {confirmReplace?.item.uses.length ? <> and updated everywhere it's used ({confirmReplace.item.uses.join(', ')}).</> : '.'} This can't be undone.
          </p>
        }
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete image"
        busy={busy}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        message={
          <p>
            Are you sure you want to delete this? <strong>{confirmDelete?.path}</strong> will be removed from storage permanently.
          </p>
        }
      />
    </AdminLayout>
  );
}
