import { describe, it, expect } from 'vitest'
import { normalizeResource, resourceFromParam, ResourceLengthError } from '../../src/runtime/shared/resource'

describe('normalizeResource', () => {
  it('trims whitespace', () => {
    expect(normalizeResource('  /blog/x  ')).toBe('blog/x')
  })
  it('rejects empty', () => {
    expect(() => normalizeResource('')).toThrow()
    expect(() => normalizeResource('   ')).toThrow()
  })
  it('strips leading slashes (/blog/x ≡ blog/x)', () => {
    expect(normalizeResource('/blog/memorylessness')).toBe('blog/memorylessness')
    expect(normalizeResource('blog/memorylessness')).toBe('blog/memorylessness')
  })
  it('supports namespaced (non-URL) ids', () => {
    expect(normalizeResource('blog:memorylessness')).toBe('blog:memorylessness')
  })
  it('collapses repeated slashes', () => {
    expect(normalizeResource('/blog//a/b')).toBe('blog/a/b')
    expect(normalizeResource('//blog///x')).toBe('blog/x')
  })
  it('strips a trailing slash', () => {
    expect(normalizeResource('/blog/x/')).toBe('blog/x')
  })
  it('preserves case', () => {
    expect(normalizeResource('/Blog/MyPost')).toBe('Blog/MyPost')
  })
  it('rejects > 512 chars', () => {
    expect(() => normalizeResource('a'.repeat(513))).toThrow()
  })
  it('honors a custom max length and reports it as a length error', () => {
    expect(normalizeResource('a'.repeat(600), 600)).toBe('a'.repeat(600))
    expect(() => normalizeResource('a'.repeat(601), 600)).toThrow(ResourceLengthError)
  })
  it('rejects resources that normalize to empty (e.g. "/")', () => {
    expect(() => normalizeResource('/')).toThrow()
  })
  it('rejects the reserved "threads/" prefix', () => {
    expect(() => normalizeResource('threads')).toThrow()
    expect(() => normalizeResource('threads/abc')).toThrow()
    expect(() => normalizeResource('/threads/abc/replies')).toThrow()
    // ...but nested occurrences are fine
    expect(normalizeResource('blog/threads')).toBe('blog/threads')
    expect(normalizeResource('blog/threads/abc')).toBe('blog/threads/abc')
  })
  it('rejects the reserved "users/" prefix', () => {
    expect(() => normalizeResource('users')).toThrow()
    expect(() => normalizeResource('users/alice')).toThrow()
    expect(() => normalizeResource('/users/alice')).toThrow()
    // ...but nested occurrences are fine
    expect(normalizeResource('blog/users')).toBe('blog/users')
    expect(normalizeResource('blog/users/alice')).toBe('blog/users/alice')
  })
})

describe('resourceFromParam', () => {
  it('joins array params', () => {
    expect(resourceFromParam(['blog', 'memorylessness'])).toBe('blog/memorylessness')
  })
  it('accepts a string', () => {
    expect(resourceFromParam('blog:thing')).toBe('blog:thing')
  })
  it('throws on undefined', () => {
    expect(() => resourceFromParam(undefined)).toThrow()
  })
  it('forwards a custom max length', () => {
    expect(resourceFromParam(['a'.repeat(600)], 600)).toBe('a'.repeat(600))
  })
  it('round-trips: normalizeResource output is a valid param value', () => {
    const stored = normalizeResource('/blog/memorylessness')
    expect(resourceFromParam(stored)).toBe(stored)
  })
})
