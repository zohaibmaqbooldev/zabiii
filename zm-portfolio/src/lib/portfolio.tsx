import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchPublicData, readCache, writeCache } from './api';
import { isConfigured } from './supabase';
import type { PortfolioData, Profile } from './types';
import { safeUrl } from './utils';

type Status = 'loading' | 'ready' | 'error';
interface Ctx {
  status: Status;
  data: PortfolioData;
  /** true while showing cached data and refreshing in the background */
  stale: boolean;
  reload: () => void;
}

const EMPTY: PortfolioData = { profile: null, projects: [], skills: [], education: [], certificates: [], socials: [], experience: [] };
const PortfolioCtx = createContext<Ctx>({ status: 'loading', data: EMPTY, stale: false, reload: () => {} });

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const cached = useMemo(() => readCache(), []);
  const [data, setData] = useState<PortfolioData>(cached ? { ...EMPTY, ...cached } : EMPTY);
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [stale, setStale] = useState(Boolean(cached));

  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    if (!isConfigured) {
      setStatus('error');
      return;
    }
    try {
      const fresh = await fetchPublicData();
      setData(fresh);
      writeCache(fresh);
      setStatus('ready');
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[portfolio] load failed', e);
      // keep showing cached content if we have it; otherwise show the error state
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setStale(false);
    }
  }, []);

  useEffect(() => {
    load();
    // refresh when the visitor returns to the tab (e.g. after editing in the admin)
    const onVis = () => document.visibilityState === 'visible' && Date.now() - lastLoad.current > 30_000 && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const reload = useCallback(() => {
    setStatus((s) => (s === 'error' ? 'loading' : s));
    load();
  }, [load]);

  return <PortfolioCtx.Provider value={{ status, data, stale, reload }}>{children}</PortfolioCtx.Provider>;
}

export const usePortfolio = () => useContext(PortfolioCtx);

/** Defaults shown only for text the brief provided, while the profile row loads/if it's missing. */
export const PROFILE_DEFAULTS = {
  name: 'Zohaib Maqbool',
  title: 'BS Computer Science Student',
  headline: 'BS Computer Science Student & Aspiring Software Developer',
  bio: "I'm a Computer Science student focused on building modern digital experiences, learning real-world software development, and turning ideas into useful products.",
  about:
    'Zohaib Maqbool is a BS Computer Science student developing practical skills in software development, web technologies, Python and modern digital products.',
  location: 'Pakistan',
  education_label: 'BS Computer Science',
  focus: 'Software Development',
  goal: 'Software Developer / Technology Entrepreneur',
};

export function useProfile() {
  const { data } = usePortfolio();
  return useMemo(() => {
    const p: Partial<Profile> = data.profile ?? {};
    const pick = <K extends keyof typeof PROFILE_DEFAULTS>(k: K) => (p[k] as string | null | undefined)?.trim() || PROFILE_DEFAULTS[k];
    const social = (name: string) =>
      safeUrl(data.socials.find((s) => s.platform.toLowerCase() === name)?.url);
    return {
      name: pick('name'),
      title: pick('title'),
      headline: pick('headline'),
      bio: pick('bio'),
      about: pick('about'),
      location: pick('location'),
      educationLabel: pick('education_label'),
      focus: pick('focus'),
      goal: pick('goal'),
      avatar: p.profile_image || null,
      aboutImage: p.about_image_url || p.profile_image || null,
      logo: p.logo_url || null,
      email: p.email?.trim() || null,
      phone: p.phone?.trim() || null,
      whatsapp: p.whatsapp?.trim() || null,
      github: safeUrl(p.github) || social('github'),
      linkedin: safeUrl(p.linkedin) || social('linkedin'),
      website: safeUrl(p.website),
    };
  }, [data]);
}
