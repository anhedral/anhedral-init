interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;
  private pruneIntervalMs: number;
  private lastPruneAt = 0;

  constructor(opts: { maxSize: number; ttlMs: number; pruneIntervalMs?: number }) {
    this.maxSize = opts.maxSize;
    this.ttlMs = opts.ttlMs;
    this.pruneIntervalMs = opts.pruneIntervalMs ?? Math.max(opts.ttlMs * 2, 60_000);
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictIfNeeded();
    this.maybePrune();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
      else break;
    }
  }

  private maybePrune(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < this.pruneIntervalMs) return;
    this.lastPruneAt = now;
    const expired: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) expired.push(key);
    }
    for (const key of expired) this.cache.delete(key);
  }
}
