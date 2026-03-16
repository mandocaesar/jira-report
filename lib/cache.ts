/**
 * Simple in-memory TTL cache for Jira API responses.
 * Reduces redundant API calls within the same server process.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private defaultTTL: number;

    constructor(defaultTTLMs: number = 5 * 60 * 1000) {
        this.defaultTTL = defaultTTLMs;
    }

    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs?: number): void {
        this.store.set(key, {
            data,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
        });
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

// Singleton cache instance — 5 minute default TTL
export const apiCache = new TTLCache(5 * 60 * 1000);
