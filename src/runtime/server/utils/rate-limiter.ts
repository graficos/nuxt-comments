import type { H3Event } from 'h3'
import { getHeader } from 'h3'

/**
 * Rate limiter port. The MVP ships an in-memory implementation
 * suitable for single-isolate development. Production should integrate
 * Cloudflare-native rate limiting (WAF / Workers Rate Limiting binding)
 * by implementing this interface — the core domain never calls the
 * limiter directly; it is invoked from the service layer as an
 * extension point.
 */
export interface RateLimiter {
  /** Returns true when the request exceeds the limit. */
  isLimited(event: H3Event, scope: string): Promise<boolean>
}

interface Bucket {
  count: number
  resetAt: number
}

/** In-memory token-bucket limiter. NOT suitable for multi-isolate prod. */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async isLimited(event: H3Event, scope: string): Promise<boolean> {
    const ip = getHeader(event, 'cf-connecting-ip')
      ?? getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown'
    const key = `${scope}:${ip}`
    const now = Date.now()
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs })
      return false
    }
    bucket.count++
    return bucket.count > this.max
  }
}

export class NoopRateLimiter implements RateLimiter {
  async isLimited(): Promise<boolean> {
    return false
  }
}

/**
 * Default in-memory limiter: 30 mutations per minute per IP.
 * Not suitable for multi-isolate production (see README — use
 * Cloudflare-native rate limiting there).
 */
const DEFAULT_MAX = 30
const DEFAULT_WINDOW_MS = 60_000

interface RateLimiterRegistry {
  __nuxtCommentsRateLimiters?: Map<string, RateLimiter>
}

/** Get (or create) the process-wide rate limiter for a strategy. */
export function getRateLimiter(kind: 'none' | 'memory'): RateLimiter {
  const registry = globalThis as RateLimiterRegistry
  registry.__nuxtCommentsRateLimiters ??= new Map<string, RateLimiter>()
  let limiter = registry.__nuxtCommentsRateLimiters.get(kind)
  if (!limiter) {
    limiter = kind === 'memory'
      ? new InMemoryRateLimiter(DEFAULT_MAX, DEFAULT_WINDOW_MS)
      : new NoopRateLimiter()
    registry.__nuxtCommentsRateLimiters.set(kind, limiter)
  }
  return limiter
}
