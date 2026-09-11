import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:workers'
import { createApp, createRouter, toWebHandler, defineEventHandler, readBody } from 'h3'
import type { H3Event } from 'h3'
import { deleteCommentsUser } from '../../src/runtime/server/services/admin.service'
import { getCommentsStore } from '../../src/runtime/server/utils/get-store'
import { setTestUser } from '../helpers/session'

// A minimal trusted-server route wrapping the admin utility. The package
// itself ships no HTTP endpoint for deletion; this mirrors how a consumer
// would wire it behind their own authorization.
const router = createRouter()
router.post('/admin/delete-user', defineEventHandler(async (event: H3Event) => {
  const body = await readBody<{ userId?: string }>(event)
  if (!body?.userId) {
    throw new Error('userId is required')
  }
  return deleteCommentsUser(event, body.userId)
}))
const app = createApp()
app.use(router)
const handler = toWebHandler(app)

async function callAdmin(userId: string): Promise<{ status: number, body: unknown }> {
  const res = await handler(new Request('http://test.local/admin/delete-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  }), { cloudflare: { env } })
  return { status: res.status, body: await res.json() }
}

describe('deleteCommentsUser (admin service)', () => {
  beforeAll(() => {
    setTestUser(null)
  })

  it('hard-deletes leaf comments, scrubs parents with replies, and removes reactions', async () => {
    const store = getCommentsStore(createEventStub())
    const leaf = await store.createComment({ resource: 'admin/site', userId: 'victim', body: 'leaf' })
    const parent = await store.createComment({ resource: 'admin/site', userId: 'victim', body: 'parent' })
    await store.createComment({ resource: 'admin/site', userId: 'other', body: 'child', parentId: parent.id })
    const target = await store.createComment({ resource: 'admin/site', userId: 'other', body: 'target' })
    await store.addReaction({ commentId: target.id, userId: 'victim', type: 'like' })

    const result = await callAdmin('victim')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ reactions: expect.any(Number), comments: expect.any(Number) })

    // leaf comment is hard-deleted
    expect(await store.getComment(leaf.id)).toBeNull()

    // parent is soft-deleted (tombstone), thread preserved, author scrubbed
    const preserved = await store.getComment(parent.id)
    expect(preserved).not.toBeNull()
    expect(preserved!.body).toBeNull()
    expect(preserved!.authorName).toBeNull()
    expect(preserved!.deletedBy).toBe('user-deletion')

    const replies = await store.listReplies(parent.id, { limit: 10 })
    expect(replies.items).toHaveLength(1)
    expect(replies.items[0]!.body).toBe('child')

    // reactions removed
    expect(await store.getUserReactions('victim', [target.id])).toHaveLength(0)
  })

  it('scrubs author snapshots from comments the user had already soft-deleted', async () => {
    const store = getCommentsStore(createEventStub())
    // A soft-deleted author comment only exists when it anchors a thread.
    const parent = await store.createComment({
      resource: 'admin/pii',
      userId: 'pii-victim',
      body: 'parent',
      authorName: 'Pii Victim',
      authorImage: 'https://img.test/pii.png',
    })
    await store.createComment({ resource: 'admin/pii', userId: 'other', body: 'child', parentId: parent.id })
    await store.deleteComment(parent.id, 'author')

    const before = await store.getComment(parent.id)
    expect(before!.deletedAt).not.toBeNull()
    expect(before!.authorName).toBe('Pii Victim')

    await callAdmin('pii-victim')

    const after = await store.getComment(parent.id)
    expect(after).not.toBeNull()
    expect(after!.authorName).toBeNull()
    expect(after!.authorImage).toBeNull()
    // The existing tombstone metadata is preserved, not overwritten.
    expect(after!.deletedBy).toBe('author')

    const replies = await store.listReplies(parent.id, { limit: 10 })
    expect(replies.items).toHaveLength(1)
    expect(replies.items[0]!.body).toBe('child')
  })

  it('rejects an empty userId', async () => {
    await expect(deleteCommentsUser(createEventStub(), '')).rejects.toThrow(/userId is required/)
  })

  /**
   * `getCommentsStore` only needs `event.context.cloudflare.env` and the
   * mocked `#imports` runtime config; a bare object suffices for direct
   * store access in tests.
   */
  function createEventStub(): H3Event {
    return { context: { cloudflare: { env } } } as unknown as H3Event
  }
})
