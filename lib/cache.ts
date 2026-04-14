/**
 * In-memory TTL cache with LRU eviction for Jira API responses.
 * Reduces redundant API calls within the same server process.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
    lastAccessed: number;
}

class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private defaultTTL: number;
    private maxEntries: number;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(defaultTTLMs: number = 5 * 60 * 1000, maxEntries: number = 100) {
        this.defaultTTL = defaultTTLMs;
        this.maxEntries = maxEntries;
        // Periodic cleanup every 60s to remove expired entries
        this.cleanupTimer = setInterval(() => this.sweep(), 60_000);
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
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
        // Evict LRU entries if at capacity
        if (!this.store.has(key) && this.store.size >= this.maxEntries) {
            this.evictLRU();
        }
        this.store.set(key, {
            data,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
            lastAccessed: Date.now(),
        });
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    private sweep(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
            }
        }
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

// Singleton cache instance — 5 minute default TTL, max 100 entries
export const apiCache = new TTLCache(5 * 60 * 1000, 100);
