import { db, storage, pathFromPublicUrl, isConfigured, ApiError } from './supabase';
import type { Certificate, Education, Experience, PortfolioData, Profile, Project, SocialLink, Skill } from './types';
import { processImage, type ImageKind } from './image';
import { slugify, uid } from './utils';

// ------------------------------------------------------------ public read ---

const PROJECT_COLS =
  'id,title,slug,short_description,full_description,image,image_path,technologies,category,github_url,live_url,featured,published,display_order,created_at,updated_at';
const ORDER = 'display_order.asc,created_at.asc';

/** One round-trip per table, all in parallel; only published / visible rows. */
export async function fetchPublicData(): Promise<PortfolioData> {
  const [profiles, projects, skills, education, certificates, socials, experience] = await Promise.all([
    db.select<Profile>('profiles', { select: '*', order: 'updated_at.desc.nullslast', limit: '1' }),
    db.select<Project>('projects', { select: PROJECT_COLS, published: 'eq.true', order: ORDER }),
    db.select<Skill>('skills', { select: 'id,name,category,proficiency,icon,display_order,visible', visible: 'not.is.false', order: ORDER }),
    db.select<Education>('education', { select: '*', visible: 'not.is.false', order: ORDER }),
    db.select<Certificate>('certificates', { select: '*', visible: 'not.is.false', order: ORDER }),
    db.select<SocialLink>('social_links', { select: '*', visible: 'not.is.false', order: ORDER }),
    // optional section: never let it take the rest of the page down
    db.select<Experience>('experience', { select: '*', visible: 'not.is.false', order: ORDER }).catch(() => [] as Experience[]),
  ]);
  return { profile: profiles[0] ?? null, projects, skills, education, certificates, socials, experience };
}

const CACHE_KEY = 'zm-public-v1';
export function readCache(): PortfolioData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw).data as PortfolioData) : null;
  } catch {
    return null;
  }
}
export function writeCache(data: PortfolioData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* quota / private mode */
  }
}
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------- admin read ---

export const admin = {
  profile: () => db.select<Profile>('profiles', { select: '*', order: 'updated_at.desc.nullslast', limit: '1' }).then((r) => r[0] ?? null),
  projects: () => db.select<Project>('projects', { select: PROJECT_COLS, order: ORDER }),
  project: (id: string) => db.select<Project>('projects', { select: PROJECT_COLS, id: `eq.${id}` }).then((r) => r[0] ?? null),
  skills: () => db.select<Skill>('skills', { select: '*', order: ORDER }),
  education: () => db.select<Education>('education', { select: '*', order: ORDER }),
  certificates: () => db.select<Certificate>('certificates', { select: '*', order: ORDER }),
  socials: () => db.select<SocialLink>('social_links', { select: '*', order: ORDER }),
  experience: () => db.select<Experience>('experience', { select: '*', order: ORDER }),
  async isAdmin(userId: string) {
    const rows = await db.select<{ user_id: string }>('admin_users', { select: 'user_id', user_id: `eq.${userId}` });
    return rows.length > 0;
  },
};

// ------------------------------------------------------------ images -------

export interface UploadedImage {
  url: string;
  path: string;
}

/**
 * Resize + convert to WebP in the browser, then upload a large and a small
 * rendition (`…-lg.webp` / `…-sm.webp`) so the site can serve responsive images.
 */
export async function uploadImage(file: File, folder: string, kind: ImageKind, onProgress?: (p: number) => void): Promise<UploadedImage> {
  const { large, small, ext } = await processImage(file, kind);
  const base = `${folder}/${Date.now().toString(36)}-${uid().slice(0, 8)}`;
  const lgPath = `${base}-lg.${ext}`;
  const smPath = `${base}-sm.${ext}`;
  const total = large.size + small.size;
  const url = await storage.upload(lgPath, large, (p) => onProgress?.(Math.round((p * large.size) / total)));
  try {
    await storage.upload(smPath, small, (p) => onProgress?.(Math.round((large.size + (p * small.size) / 100) / total * 100)));
  } catch (e) {
    await storage.remove([lgPath]).catch(() => {});
    throw e;
  }
  onProgress?.(100);
  return { url, path: lgPath };
}

/** Both renditions for a stored path (older single-file uploads are handled too). */
export function renditionPaths(path: string) {
  return /-lg\.(webp|jpe?g|png|gif)$/.test(path) ? [path, path.replace(/-lg\.(\w+)$/, '-sm.$1')] : [path];
}

/** Every place an image URL is used across the site. */
export async function findImageUsage(url: string) {
  const [projects, certs, profile] = await Promise.all([
    db.select<Pick<Project, 'id' | 'title'>>('projects', { select: 'id,title', image: `eq.${url}` }),
    db.select<Pick<Certificate, 'id' | 'title'>>('certificates', { select: 'id,title', image: `eq.${url}` }),
    admin.profile(),
  ]);
  const uses: string[] = [];
  projects.forEach((p) => uses.push(`Project: ${p.title}`));
  certs.forEach((c) => uses.push(`Certificate: ${c.title}`));
  if (profile?.profile_image === url) uses.push('Profile photo');
  if (profile?.about_image_url === url) uses.push('About image');
  if (profile?.logo_url === url) uses.push('Logo');
  return uses;
}

/** Delete an uploaded image only when nothing references it any more. */
export async function deleteImageIfUnused(url: string | null | undefined) {
  const path = pathFromPublicUrl(url);
  if (!path || !url) return false; // built-in / external images are never deleted
  const uses = await findImageUsage(url);
  if (uses.length) return false;
  await storage.remove(renditionPaths(path));
  return true;
}

// ------------------------------------------------------------ projects -----

export type ProjectInput = Omit<Project, 'id' | 'created_at' | 'updated_at'>;

export async function uniqueSlug(wanted: string, exceptId?: string) {
  const base = slugify(wanted) || 'project';
  const rows = await db.select<Pick<Project, 'id' | 'slug'>>('projects', { select: 'id,slug', slug: `like.${base}*` });
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${uid().slice(0, 6)}`;
}

export async function createProject(input: ProjectInput) {
  const slug = await uniqueSlug(input.slug || input.title);
  const [row] = await db.insert<Project>('projects', { ...input, slug });
  return row;
}

export async function updateProject(id: string, patch: Partial<ProjectInput>) {
  if (patch.slug !== undefined) patch.slug = await uniqueSlug(patch.slug || patch.title || 'project', id);
  const [row] = await db.update<Project>('projects', { id }, patch);
  return row;
}

export async function duplicateProject(p: Project, nextOrder: number) {
  const slug = await uniqueSlug(`${p.slug}-copy`);
  const [row] = await db.insert<Project>('projects', {
    title: `${p.title} (copy)`,
    slug,
    short_description: p.short_description,
    full_description: p.full_description,
    image: p.image,
    image_path: p.image_path,
    technologies: p.technologies,
    category: p.category,
    github_url: p.github_url,
    live_url: p.live_url,
    featured: false,
    published: false,
    display_order: nextOrder,
  });
  return row;
}

export async function deleteProject(p: Project) {
  await db.remove('projects', { id: p.id });
  // the row is gone; clean up its image if no other project (e.g. a duplicate) still uses it
  await deleteImageIfUnused(p.image).catch(() => {});
}

// ------------------------------------------------------ ordering (generic) -

/** Persist a new order as 1..n, touching only rows whose position changed. */
export async function saveOrder(table: string, ids: string[], current: { id: string; display_order: number }[]) {
  const byId = new Map(current.map((r) => [r.id, r.display_order]));
  await Promise.all(
    ids.map((id, i) => (byId.get(id) === i + 1 ? null : db.update(table, { id }, { display_order: i + 1 }))).filter(Boolean),
  );
}

export function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = list.slice();
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}

// ------------------------------------------------------------ profile ------

export async function saveProfile(existingId: string | null, userId: string, patch: Partial<Profile>) {
  if (existingId) return (await db.update<Profile>('profiles', { id: existingId }, patch))[0];
  // first save: use the admin's auth id so it also works when profiles.id references auth.users
  return (await db.insert<Profile>('profiles', { ...patch, id: userId }))[0];
}

export function assertConfigured() {
  if (!isConfigured) throw new ApiError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and rebuild.', 0, 'not_configured');
}
