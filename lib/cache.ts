/**
 * In-memory TTL cache with LRU eviction for Jira API responses.
 * Reduces redundant API calls within the same server process.
 *
 * Includes thundering-herd protection: concurrent requests for the same key
 * share a single in-flight fetch via `getOrFetch()`.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
    lastAccessed: number;
}

class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private inflight = new Map<string, Promise<unknown>>();
    private defaultTTL: number;
    private maxEntries: number;

    constructor(defaultTTLMs: number = 5 * 60 * 1000, maxEntries: number = 100) {
        this.defaultTTL = defaultTTLMs;
        this.maxEntries = maxEntries;
    }

    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        entry.lastAccessed = Date.now();
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs?: number): void {
        if (!this.store.has(key) && this.store.size >= this.maxEntries) {
            this.evictLRU();
        }
        this.store.set(key, {
            data,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
            lastAccessed: Date.now(),
        });
    }

    /**
     * Get cached value or fetch it, with thundering-herd protection.
     * Concurrent callers for the same key share a single in-flight fetch.
     */
    async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) return cached;

        const existing = this.inflight.get(key);
        if (existing) return existing as Promise<T>;

        const promise = fetcher()
            .then(data => {
                this.set(key, data, ttlMs);
                return data;
            })
            .finally(() => this.inflight.delete(key));

        this.inflight.set(key, promise);
        return promise;
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    /** Remove all entries whose key starts with the given prefix. */
    invalidatePrefix(prefix: string): void {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
            }
        }
    }

    clear(): void {
        this.store.clear();
    }

    private evictLRU(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, entry] of this.store) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) this.store.delete(oldestKey);
    }
}

// Singleton cache instance — 5 minute default TTL, max 200 entries
export const apiCache = new TTLCache(5 * 60 * 1000, 200);
