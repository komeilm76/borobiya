export type Clock = () => number;

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** Deterministic, bounded LRU cache with optional TTL. No timers or hidden mutations. */
export class LruTtlCache<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(
    private readonly max: number,
    private readonly ttlMs = Number.POSITIVE_INFINITY,
    private readonly clock: Clock = () => Date.now()
  ) {
    if (!Number.isSafeInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
  }

  get size(): number { return this.map.size; }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (entry.expiresAt <= this.clock()) {
      this.map.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry || entry.expiresAt <= this.clock()) return undefined;
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.ttlMs): V {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.clock() + ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
      this.evictions++;
    }
    return value;
  }

  has(key: K): boolean { return this.get(key) !== undefined; }

  delete(key: K): boolean { return this.map.delete(key); }

  clear(): void { this.map.clear(); this.hits = 0; this.misses = 0; this.evictions = 0; this.expirations = 0; }

  keys(): K[] { this.prune(); return [...this.map.keys()]; }

  values(): V[] { this.prune(); return [...this.map.values()].map((entry) => entry.value); }

  entries(): Array<[K, V]> { this.prune(); return [...this.map.entries()].map(([key, entry]) => [key, entry.value]); }

  deleteWhere(predicate: (value: V, key: K) => boolean): number {
    let removed = 0;
    for (const [key, entry] of this.map) {
      if (predicate(entry.value, key)) { this.map.delete(key); removed++; }
    }
    return removed;
  }

  prune(): number {
    const now = this.clock();
    let removed = 0;
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) { this.map.delete(key); removed++; this.expirations++; }
    }
    return removed;
  }

  stats(): { size: number; max: number; hits: number; misses: number; evictions: number; expirations: number } {
    return { size: this.map.size, max: this.max, hits: this.hits, misses: this.misses, evictions: this.evictions, expirations: this.expirations };
  }
}
