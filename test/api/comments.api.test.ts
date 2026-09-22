import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:workers'
import { createApp, createRouter, toWebHandler } from 'h3'
import { setTestUser, type TestUser } from '../helpers/session'
import resourceGet from '../../src/runtime/server/api/_comments/resource.get'
import resourcePost from '../../src/runtime/server/api/_comments/resource.post'
import commentPatch from '../../src/runtime/server/api/_comments/comment.patch'
import commentDelete from '../../src/runtime/server/api/_comments/comment.delete'
import repliesGet from '../../src/runtime/server/api/_comments/replies.get'
import repliesPost from '../../src/runtime/server/api/_comments/replies.post'
import reactionsGet from '../../src/runtime/server/api/_comments/reactions.get'
import reactionsPost from '../../src/runtime/server/api/_comments/reactions.post'
import reactionsTypeDelete from '../../src/runtime/server/api/_comments/reactions-type.delete'

// Build an h3 app mirroring the module's registered routes.
const router = createRouter()
router.get('/api/_comments/**:resource', resourceGet)
router.post('/api/_comments/**:resource', resourcePost)
router.patch('/api/_comments/threads/:commentId', commentPatch)
router.delete('/api/_comments/threads/:commentId', commentDelete)
router.get('/api/_comments/threads/:commentId/replies', repliesGet)
router.post('/api/_comments/threads/:commentId/replies', repliesPost)
router.get('/api/_comments/threads/reactions', reactionsGet)
router.post('/api/_comments/threads/:commentId/reactions', reactionsPost)
router.delete('/api/_comments/threads/:commentId/reactions/:type', reactionsTypeDelete)
const app = createApp()
app.use(router)
const handler = toWebHandler(app)

interface ApiResponse<T = unknown> {
  status: number
  body: T
}

async function api<T = unknown>(
  method: string,
  path: string,
  opts?: { body?: unknown, user?: TestUser | null },
): Promise<ApiResponse<T & { data?: { code?: string, error?: { code?: string, message?: string } } }>> {
  setTestUser(opts?.user ?? null)
  const response = await handler(new Request(`http://test.local${path}`, {
    method,
    headers: opts?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }), { cloudflare: { env } })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  return { status: response.status, body }
}

/** Extract the package's error code from h3's error envelope. */
function errorCode(body: { data?: { code?: string } }): string | undefined {
  return body?.data?.code
}

const ALICE: TestUser = { id: 'alice', name: 'Alice', image: null }
const BOB: TestUser = { id: 'bob', name: 'Bob', image: null }

/** Assert the paginated envelope shape (nextCursor may be null). */
function expectPaginated(body: { items?: unknown, nextCursor?: unknown, hasMore?: unknown }): void {
  expect(Array.isArray(body.items)).toBe(true)
  expect(body).toHaveProperty('nextCursor')
  expect(typeof body.hasMore).toBe('boolean')
}

describe('comments API (workers runtime)', () => {
  beforeAll(() => {
    setTestUser(null)
  })

  beforeEach(() => {
    setTestUser(null)
  })

  describe('reads', () => {
    it('allows unauthenticated reads and returns an empty page', async () => {
      const res = await api('GET', '/api/_comments/blog/empty-resource')
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ items: [] })
    })

    it('does not expose resources under the reserved "threads/" prefix', async () => {
      // `threads/` is reserved for comment-scoped routes; it is not a
      // valid resource namespace (normalizeResource also rejects it).
      const res = await api('GET', '/api/_comments/threads/foo')
      expect(res.status).toBe(404)
    })

    it('treats multi-segment resources ending in "reactions" as resources', async () => {
      // Regression: formerly `/api/_comments/blog/reactions` was parsed as a
      // reaction on comment `blog`. It must be a resource path.
      const created = await api<{ resource: string }>('POST', '/api/_comments/blog/reactions', {
        body: { body: 'a resource, not a reaction' },
        user: ALICE,
      })
      expect(created.status).toBe(200)
      expect(created.body.resource).toBe('blog/reactions')
    })
  })

  describe('create / read / edit / delete (authenticated)', () => {
    it('rejects unauthenticated mutation with 401', async () => {
      const res = await api('POST', '/api/_comments/blog/auth-check', { body: { body: 'hi' } })
      expect(res.status).toBe(401)
      expect(errorCode(res.body)).toBe('unauthenticated')
    })

    it('rejects an empty body with 422', async () => {
      const res = await api('POST', '/api/_comments/blog/validation', { body: { body: '' }, user: ALICE })
      expect(res.status).toBe(422)
      expect(errorCode(res.body)).toBe('validation_failed')
    })

    it('creates and reads back a comment', async () => {
      const created = await api<{ id: string }>('POST', '/api/_comments/blog/crud', {
        body: { body: 'hello world' },
        user: ALICE,
      })
      expect(created.status).toBe(200)
      expect(created.body.id).toBeTruthy()

      const list = await api<{ items: Array<{ body: string }> }>('GET', '/api/_comments/blog/crud')
      expect(list.status).toBe(200)
      expectPaginated(list.body)
      expect(list.body.items[0]!.body).toBe('hello world')
    })

    it('rejects editing another user\'s comment with 403', async () => {
      const created = await api<{ id: string }>('POST', '/api/_comments/blog/ownership', {
        body: { body: 'mine' },
        user: ALICE,
      })
      const res = await api('PATCH', `/api/_comments/threads/${created.body.id}`, {
        body: { body: 'hacked' },
        user: BOB,
      })
      expect(res.status).toBe(403)
      expect(errorCode(res.body)).toBe('forbidden')
    })

    it('allows the author to edit their comment', async () => {
      const created = await api<{ id: string }>('POST', '/api/_comments/blog/edit', {
        body: { body: 'before' },
        user: ALICE,
      })
      const res = await api<{ body: string }>('PATCH', `/api/_comments/threads/${created.body.id}`, {
        body: { body: 'after' },
        user: ALICE,
      })
      expect(res.status).toBe(200)
      expect(res.body.body).toBe('after')
    })

    it('soft-deletes a leaf comment (author only)', async () => {
      const created = await api<{ id: string }>('POST', '/api/_comments/blog/delete', {
        body: { body: 'bye' },
        user: ALICE,
      })
      const forbidden = await api('DELETE', `/api/_comments/threads/${created.body.id}`, { user: BOB })
      expect(forbidden.status).toBe(403)

      const ok = await api('DELETE', `/api/_comments/threads/${created.body.id}`, { user: ALICE })
      expect(ok.status).toBe(200)

      const list = await api<{ items: { id: string, body: string | null, deletedAt: string | null }[] }>('GET', '/api/_comments/blog/delete')
      expect(list.body.items).toHaveLength(1)
      expect(list.body.items[0]!.id).toBe(created.body.id)
      expect(list.body.items[0]!.body).toBeNull()
      expect(list.body.items[0]!.deletedAt).not.toBeNull()
    })
  })

  describe('replies', () => {
    it('creates a reply and lists it without fetching the whole discussion', async () => {
      const parent = await api<{ id: string }>('POST', '/api/_comments/blog/threads', {
        body: { body: 'parent' },
        user: ALICE,
      })
      const child = await api<{ id: string, parentId: string }>('POST', `/api/_comments/threads/${parent.body.id}/replies`, {
        body: { body: 'child' },
        user: BOB,
      })
      expect(child.status).toBe(200)
      expect(child.body.parentId).toBe(parent.body.id)

      const replies = await api<{ items: Array<{ body: string }> }>('GET', `/api/_comments/threads/${parent.body.id}/replies`)
      expect(replies.status).toBe(200)
      expectPaginated(replies.body)
      expect(replies.body.items[0]!.body).toBe('child')

      // Top-level listing does not include replies (only top-level comments).
      const top = await api<{ items: Array<{ id: string }> }>('GET', '/api/_comments/blog/threads')
      expect(top.body.items.some(c => c.id === parent.body.id)).toBe(true)
      expect(top.body.items.some(c => c.id === child.body.id)).toBe(false)
    })

    it('returns 404 when replying to a missing parent', async () => {
      const res = await api('POST', '/api/_comments/threads/does-not-exist/replies', {
        body: { body: 'orphan' },
        user: ALICE,
      })
      expect(res.status).toBe(404)
      expect(errorCode(res.body)).toBe('not_found')
    })
  })

  describe('reactions', () => {
    it('adds, de-duplicates, and removes a reaction', async () => {
      const comment = await api<{ id: string }>('POST', '/api/_comments/blog/reactions', {
        body: { body: 'react to me' },
        user: ALICE,
      })
      const first = await api('POST', `/api/_comments/threads/${comment.body.id}/reactions`, {
        body: { type: 'like' },
        user: BOB,
      })
      expect(first.status).toBe(200)

      // duplicate same-type reaction stays a single row
      const duplicate = await api('POST', `/api/_comments/threads/${comment.body.id}/reactions`, {
        body: { type: 'like' },
        user: BOB,
      })
      expect(duplicate.status).toBe(200)

      const list = await api<{ items: Array<{ counts: Record<string, number> }> }>('GET', `/api/_comments/threads/reactions?ids=${comment.body.id}`)
      expect(list.body.items[0]!.counts.like).toBe(1)

      const removed = await api('DELETE', `/api/_comments/threads/${comment.body.id}/reactions/like`, { user: BOB })
      expect(removed.status).toBe(200)
      const after = await api<{ items: Array<{ counts: Record<string, number> }> }>('GET', `/api/_comments/threads/reactions?ids=${comment.body.id}`)
      expect(after.body.items[0]!.counts.like ?? 0).toBe(0)
    })

    it('rejects a disallowed reaction type with 422', async () => {
      const comment = await api<{ id: string }>('POST', '/api/_comments/blog/reactions-invalid', {
        body: { body: 'x' },
        user: ALICE,
      })
      const res = await api('POST', `/api/_comments/threads/${comment.body.id}/reactions`, {
        body: { type: 'explode' },
        user: ALICE,
      })
      expect(res.status).toBe(422)
      expect(errorCode(res.body)).toBe('validation_failed')
    })

    it('requires authentication to react', async () => {
      const comment = await api<{ id: string }>('POST', '/api/_comments/blog/reactions-auth', {
        body: { body: 'x' },
        user: ALICE,
      })
      const res = await api('POST', `/api/_comments/threads/${comment.body.id}/reactions`, {
        body: { type: 'like' },
        user: null,
      })
      expect(res.status).toBe(401)
    })
  })

  describe('pagination', () => {
    it('paginates top-level comments with cursors', async () => {
      for (let i = 0; i < 3; i++) {
        await api('POST', '/api/_comments/blog/pagination', { body: { body: `c${i}` }, user: ALICE })
      }
      const page1 = await api<{ items: Array<{ id: string }>, nextCursor: string | null, hasMore: boolean }>(
        'GET',
        '/api/_comments/blog/pagination?limit=2',
      )
      expect(page1.body.items).toHaveLength(2)
      expect(page1.body.hasMore).toBe(true)
      expect(page1.body.nextCursor).toBeTruthy()

      const page2 = await api<{ items: Array<{ id: string }>, hasMore: boolean }>(
        'GET',
        `/api/_comments/blog/pagination?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor!)}`,
      )
      expect(page2.body.items).toHaveLength(1)
      expect(page2.body.hasMore).toBe(false)
      // no overlap
      const ids1 = new Set(page1.body.items.map(c => c.id))
      expect(page2.body.items.some(c => ids1.has(c.id))).toBe(false)
    })
  })

  describe('resource isolation', () => {
    it('does not leak comments across resources', async () => {
      await api('POST', '/api/_comments/blog/resource-a', { body: { body: 'on a' }, user: ALICE })
      await api('POST', '/api/_comments/blog/resource-b', { body: { body: 'on b' }, user: ALICE })
      const a = await api<{ items: Array<{ body: string }> }>('GET', '/api/_comments/blog/resource-a')
      const b = await api<{ items: Array<{ body: string }> }>('GET', '/api/_comments/blog/resource-b')
      expect(a.body.items.map(c => c.body)).toEqual(['on a'])
      expect(b.body.items.map(c => c.body)).toEqual(['on b'])
    })
  })
})
