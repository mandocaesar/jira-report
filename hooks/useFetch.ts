'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── Client-side request deduplication ─────────────────────────────────────
// Concurrent fetches to the same URL share a single in-flight request.
// Results are cached briefly (5s) so rapid re-mounts don't re-fetch.

interface CachedEntry {
  data: unknown;
  expiresAt: number;
}

const inflightRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, CachedEntry>();
const DEFAULT_CACHE_TTL = 60_000; // 60 seconds
const MAX_CACHE_ENTRIES = 50;

/** Invalidate cached entries matching a URL prefix. */
export function invalidateClientCache(prefix?: string) {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

function getCached<T>(url: string): T | undefined {
  const entry = responseCache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(url);
    return undefined;
  }
  return entry.data as T;
}

async function deduplicatedFetch<T>(url: string, signal: AbortSignal, ttl: number = DEFAULT_CACHE_TTL): Promise<T> {
  // Check short-lived cache first
  const cached = getCached<T>(url);
  if (cached !== undefined) return cached;

  // Join existing in-flight request if one exists. The shared request is NOT
  // tied to any caller's abort signal — otherwise the first caller unmounting
  // (e.g. React strict-mode double-mount) would reject the promise for every
  // joined caller. Aborts are handled per-caller after the shared await.
  let promise = inflightRequests.get(url) as Promise<T> | undefined;
  if (!promise) {
    promise = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const json = await response.json();
        if (!json.success) {
          throw new Error(json.error || 'Request failed');
        }
        // Evict oldest entries if cache is full
        if (responseCache.size >= MAX_CACHE_ENTRIES) {
          const firstKey = responseCache.keys().next().value;
          if (firstKey) responseCache.delete(firstKey);
        }
        // Cache the result
        responseCache.set(url, { data: json.data, expiresAt: Date.now() + ttl });
        return json.data as T;
      } finally {
        inflightRequests.delete(url);
      }
    })();
    inflightRequests.set(url, promise);
  }

  const result = await promise;
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return result;
}

/**
 * Generic data fetching hook — replaces 15+ identical fetch+loading+error patterns.
 *
 * @param url - API URL to fetch (null/undefined skips fetch)
 * @param deps - dependency array for re-fetching
 *
 * Expects JSON responses in `{ success: boolean, data?: T, error?: string }` format.
 */
interface UseFetchOptions {
  /** Cache TTL in milliseconds. Default 60s. */
  ttl?: number;
  /** Extra dependencies that trigger re-fetch. */
  deps?: unknown[];
}

export function useFetch<T>(
  url: string | null | undefined,
  depsOrOptions: unknown[] | UseFetchOptions = [],
): UseFetchResult<T> {
  const { ttl, deps } = Array.isArray(depsOrOptions)
    ? { ttl: DEFAULT_CACHE_TTL, deps: depsOrOptions }
    : { ttl: depsOrOptions.ttl ?? DEFAULT_CACHE_TTL, deps: depsOrOptions.deps ?? [] };
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await deduplicatedFetch<T>(url, controller.signal, ttl);
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
