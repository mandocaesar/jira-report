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
const CACHE_TTL = 5_000; // 5 seconds

function getCached<T>(url: string): T | undefined {
  const entry = responseCache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(url);
    return undefined;
  }
  return entry.data as T;
}

async function deduplicatedFetch<T>(url: string, signal: AbortSignal): Promise<T> {
  // Check short-lived cache first
  const cached = getCached<T>(url);
  if (cached !== undefined) return cached;

  // Join existing in-flight request if one exists
  const inflight = inflightRequests.get(url);
  if (inflight) return inflight as Promise<T>;

  // Start new request
  const promise = (async () => {
    try {
      const response = await fetch(url, { signal });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || `Request failed with status ${response.status}`);
      }
      // Cache the result briefly
      responseCache.set(url, { data: json.data, expiresAt: Date.now() + CACHE_TTL });
      return json.data as T;
    } finally {
      inflightRequests.delete(url);
    }
  })();

  inflightRequests.set(url, promise);
  return promise;
}

/**
 * Generic data fetching hook — replaces 15+ identical fetch+loading+error patterns.
 *
 * @param url - API URL to fetch (null/undefined skips fetch)
 * @param deps - dependency array for re-fetching
 *
 * Expects JSON responses in `{ success: boolean, data?: T, error?: string }` format.
 */
export function useFetch<T>(
  url: string | null | undefined,
  deps: unknown[] = [],
): UseFetchResult<T> {
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
      const result = await deduplicatedFetch<T>(url, controller.signal);
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
