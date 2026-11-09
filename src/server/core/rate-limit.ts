import { LruTtlCache, type Clock } from './cache.ts';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateRule {
  name: string;
  capacity: number;
  refillPerSecond: number;
  windowMs?: number;
}

class TokenBucketLimiter {
  private readonly cache: LruTtlCache<string, Bucket>;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    windowMs: number,
    clock: Clock
  ) {
    this.cache = new LruTtlCache<string, Bucket>(10000, Math.max(windowMs, 60_000) * 2, clock);
  }

  consume(key: string, cost: number, now: number): RateLimitResult {
    const previous = this.cache.get(key);
    const tokensBefore = previous ? previous.tokens : this.capacity;
    const elapsedMs = previous ? Math.max(0, now - previous.updatedAt) : 0;
    const tokens = Math.min(this.capacity, tokensBefore + (elapsedMs / 1000) * this.refillPerSecond);
    if (tokens < cost) {
      const missing = cost - tokens;
      const retryAfterMs = Math.ceil((missing / this.refillPerSecond) * 1000);
      this.cache.set(key, { tokens, updatedAt: now });
      return { allowed: false, remaining: Math.floor(tokens), retryAfterMs };
    }
    const remaining = tokens - cost;
    this.cache.set(key, { tokens: remaining, updatedAt: now });
    return { allowed: true, remaining: Math.floor(remaining), retryAfterMs: 0 };
  }

  clear(): void { this.cache.clear(); }
}

export class RateLimiters {
  private readonly limiters = new Map<string, TokenBucketLimiter>();
  constructor(private readonly clock: Clock = () => Date.now()) {}

  consume(rule: RateRule, key: string, cost = 1): RateLimitResult {
    let limiter = this.limiters.get(rule.name);
    if (!limiter) {
      limiter = new TokenBucketLimiter(rule.capacity, rule.refillPerSecond, rule.windowMs ?? 60_000, this.clock);
      this.limiters.set(rule.name, limiter);
    }
    return limiter.consume(key, cost, this.clock());
  }

  clear(): void {
    for (const limiter of this.limiters.values()) limiter.clear();
    this.limiters.clear();
  }
}
