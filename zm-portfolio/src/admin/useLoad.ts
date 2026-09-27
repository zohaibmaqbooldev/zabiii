import { useCallback, useEffect, useRef, useState } from 'react';
import { clearCache } from '../lib/api';

/** Load data for an admin screen, with loading/error state and a reload(). */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** After any admin write, make sure the public site doesn't show a stale cached copy. */
export function markPublicDirty() {
  clearCache();
}
