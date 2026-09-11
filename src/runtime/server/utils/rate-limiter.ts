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

export interface InMemoryRateLimiterOptions {
  max: number
  windowMs: number
  /** Trust `x-forwarded-for` when resolving the client IP (only behind a trusted proxy). */
  trustProxy?: boolean
  /** Maximum tracked keys before expired/oldest entries are evicted. */
  maxKeys?: number
}

const DEFAULT_MAX_KEYS = 10_000

/** In-memory token-bucket limiter. NOT suitable for multi-isolate prod. */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>()
  private readonly max: number
  private readonly windowMs: number
  private readonly trustProxy: boolean
  private readonly maxKeys: number

  constructor(options: InMemoryRateLimiterOptions) {
    this.max = options.max
    this.windowMs = options.windowMs
    this.trustProxy = options.trustProxy ?? false
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS
  }

  async isLimited(event: H3Event, scope: string): Promise<boolean> {
    const ip = resolveClientIp(event, this.trustProxy)
    const key = `${scope}:${ip}`
    const now = Date.now()
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt < now) {
      this.enforceCapacity(now)
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs })
      return false
    }
    bucket.count++
    return bucket.count > this.max
  }

  /** Keep the map bounded: drop expired buckets, then the oldest if needed. */
  private enforceCapacity(now: number) {
    if (this.buckets.size < this.maxKeys) return
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt < now) this.buckets.delete(key)
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value
      if (oldest === undefined) break
      this.buckets.delete(oldest)
    }
  }

  /** Number of tracked keys (exposed for tests). */
  get trackedKeys(): number {
    return this.buckets.size
  }
}

export class NoopRateLimiter implements RateLimiter {
  async isLimited(): Promise<boolean> {
    return false
  }
}

/**
 * Resolve the client IP used for rate limiting. Cloudflare's
 * `cf-connecting-ip` is preferred. `x-forwarded-for` is only consulted when
 * `trustProxy` is enabled — it is client-controlled and must not be trusted
 * unless a trusted proxy sets it.
 */
export function resolveClientIp(event: H3Event, trustProxy = false): string {
  const cf = getHeader(event, 'cf-connecting-ip')
  if (cf) return cf
  if (trustProxy) {
    const forwarded = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return 'unknown'
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

export interface RateLimiterOptions {
  /** Trust `x-forwarded-for` for client IP (only behind a trusted proxy). */
  trustProxy?: boolean
}

/** Get (or create) the process-wide rate limiter for a strategy. */
export function getRateLimiter(kind: 'none' | 'memory', options: RateLimiterOptions = {}): RateLimiter {
  const trustProxy = options.trustProxy ?? false
  const registry = globalThis as RateLimiterRegistry
  registry.__nuxtCommentsRateLimiters ??= new Map<string, RateLimiter>()
  const key = `${kind}:${trustProxy ? 'proxy' : 'direct'}`
  let limiter = registry.__nuxtCommentsRateLimiters.get(key)
  if (!limiter) {
    limiter = kind === 'memory'
      ? new InMemoryRateLimiter({ max: DEFAULT_MAX, windowMs: DEFAULT_WINDOW_MS, trustProxy })
      : new NoopRateLimiter()
    registry.__nuxtCommentsRateLimiters.set(key, limiter)
  }
  return limiter
}
