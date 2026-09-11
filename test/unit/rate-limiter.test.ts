import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { InMemoryRateLimiter, resolveClientIp } from '../../src/runtime/server/utils/rate-limiter'

/** Minimal h3 event stub: `getHeader` reads `event.node.req.headers`. */
function eventWith(headers: Record<string, string>): H3Event {
  return { node: { req: { headers } } } as unknown as H3Event
}

describe('InMemoryRateLimiter', () => {
  it('allows the limit then rejects the next call', async () => {
    const limiter = new InMemoryRateLimiter({ max: 3, windowMs: 60_000 })
    const event = eventWith({ 'cf-connecting-ip': '1.1.1.1' })
    expect(await limiter.isLimited(event, 'comments:create')).toBe(false)
    expect(await limiter.isLimited(event, 'comments:create')).toBe(false)
    expect(await limiter.isLimited(event, 'comments:create')).toBe(false)
    expect(await limiter.isLimited(event, 'comments:create')).toBe(true)
  })

  it('resets after the window elapses', async () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowMs: 10 })
    const event = eventWith({ 'cf-connecting-ip': '2.2.2.2' })
    expect(await limiter.isLimited(event, 's')).toBe(false)
    expect(await limiter.isLimited(event, 's')).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(await limiter.isLimited(event, 's')).toBe(false)
  })

  it('tracks limits per scope', async () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowMs: 60_000 })
    const event = eventWith({ 'cf-connecting-ip': '3.3.3.3' })
    expect(await limiter.isLimited(event, 'a')).toBe(false)
    expect(await limiter.isLimited(event, 'b')).toBe(false)
    expect(await limiter.isLimited(event, 'a')).toBe(true)
  })

  it('keeps its key map bounded', async () => {
    const limiter = new InMemoryRateLimiter({ max: 5, windowMs: 60_000, maxKeys: 2 })
    for (const ip of ['a', 'b', 'c', 'd', 'e']) {
      await limiter.isLimited(eventWith({ 'cf-connecting-ip': ip }), 's')
    }
    expect(limiter.trackedKeys).toBeLessThanOrEqual(2)
  })
})

describe('resolveClientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const event = eventWith({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '8.8.8.8' })
    expect(resolveClientIp(event, false)).toBe('9.9.9.9')
  })

  it('ignores x-forwarded-for unless trustProxy is enabled', () => {
    const event = eventWith({ 'x-forwarded-for': '8.8.8.8, 7.7.7.7' })
    expect(resolveClientIp(event, false)).toBe('unknown')
    expect(resolveClientIp(event, true)).toBe('8.8.8.8')
  })

  it('falls back to unknown with no headers', () => {
    expect(resolveClientIp(eventWith({}), true)).toBe('unknown')
  })
})