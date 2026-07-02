// Tiny synchronous stale-while-revalidate cache. Same philosophy as opsStore:
// a module-level singleton that survives route changes, so returning to a page
// can paint its last-known data INSTANTLY instead of flashing a skeleton while
// the network round-trips. The page still revalidates in the background and
// swaps in fresh data when it lands. No TanStack Query — just a Map + a hook.

import { useCallback, useEffect, useRef, useState } from "react";

type Entry<T> = { data: T; at: number };

const store = new Map<string, Entry<unknown>>();

/** Last cached value for a key, or undefined if never fetched this session. */
export function getCached<T>(key: string): T | undefined {
  return (store.get(key)?.data as T | undefined) ?? undefined;
}

/** True if the key was cached within the last `ttlMs`. Lets a page skip the
 *  background revalidation on mount when its data is still fresh — so rapid
 *  section-to-section switching renders ONCE (cache hit) instead of twice
 *  (cache hit + refetch re-render), which is the bulk of per-navigation cost. */
export function isFresh(key: string, ttlMs: number): boolean {
  const e = store.get(key);
  return !!e && Date.now() - e.at < ttlMs;
}

/** Overwrite the cached value for a key. */
export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

/** Drop a cached entry (e.g. after a mutation that invalidates it). */
export function invalidate(key: string): void {
  store.delete(key);
}

type Options = {
  /** Skip the fetch entirely (e.g. missing prerequisites). */
  enabled?: boolean;
};

/**
 * Serve `key` from cache immediately (if present) and revalidate in the
 * background. `loading` is only true on the very first fetch for a key — a
 * revalidation over cached data keeps the stale value visible (no skeleton).
 */
export function useCachedResource<T>(key: string, fetcher: () => Promise<T>, opts: Options = {}) {
  const { enabled = true } = opts;
  const [data, setData] = useState<T | undefined>(() => getCached<T>(key));
  const [loading, setLoading] = useState<boolean>(() => getCached<T>(key) === undefined);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const revalidate = useCallback(async () => {
    if (!enabled) return;
    const hasCache = getCached<T>(key) !== undefined;
    if (!hasCache && mounted.current) setLoading(true);
    if (mounted.current) setError(false);
    try {
      const fresh = await fetcher();
      setCached(key, fresh);
      if (mounted.current) setData(fresh);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // fetcher identity changes every render; key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    mounted.current = true;
    // Re-seed synchronously when the key changes so we never show another key's data.
    const seed = getCached<T>(key);
    setData(seed);
    setLoading(seed === undefined);
    void revalidate();
    return () => { mounted.current = false; };
  }, [key, revalidate]);

  return { data, loading, error, revalidate };
}
