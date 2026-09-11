import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:workers'
import { D1CommentsStore } from '../../src/runtime/server/repositories/d1-comments-store'
import type { Comment } from '../../src/runtime/shared/types'

let store: D1CommentsStore

describe('D1CommentsStore', () => {
  beforeAll(() => {
    store = new D1CommentsStore(env.DB)
  })

  it('creates and lists top-level comments', async () => {
    const a = await store.createComment({ resource: '/blog/a', userId: 'u1', body: 'first', authorName: 'Alice' })
    const b = await store.createComment({ resource: '/blog/a', userId: 'u2', body: 'second', authorName: 'Bob' })
    expect(a.body).toBe('first')
    expect(a.parentId).toBeNull()
    const page = await store.listTopLevel('/blog/a', { limit: 10 })
    expect(page.items).toHaveLength(2)
    // newest first
    expect(page.items[0]!.id).toBe(b.id)
    expect(page.hasMore).toBe(false)
  })

  it('isolates comments by resource', async () => {
    await store.createComment({ resource: '/blog/a', userId: 'u1', body: 'on a' })
    await store.createComment({ resource: '/blog/b', userId: 'u1', body: 'on b' })
    const a = await store.listTopLevel('/blog/a', { limit: 50 })
    const b = await store.listTopLevel('/blog/b', { limit: 50 })
    expect(a.items.every(c => c.resource === '/blog/a')).toBe(true)
    expect(b.items.every(c => c.resource === '/blog/b')).toBe(true)
    expect(a.items.some(c => c.body === 'on b')).toBe(false)
  })

  it('creates nested replies', async () => {
    const top = await store.createComment({ resource: '/blog/nested', userId: 'u1', body: 'top' })
    const r1 = await store.createComment({ resource: '/blog/nested', userId: 'u2', body: 'reply1', parentId: top.id })
    const r2 = await store.createComment({ resource: '/blog/nested', userId: 'u1', body: 'reply2', parentId: r1.id })
    expect(r1.parentId).toBe(top.id)
    expect(r2.parentId).toBe(r1.id)
    const replies = await store.listReplies(top.id, { limit: 10 })
    expect(replies.items).toHaveLength(1)
    expect(replies.items[0]!.id).toBe(r1.id)
    const nested = await store.listReplies(r1.id, { limit: 10 })
    expect(nested.items[0]!.id).toBe(r2.id)
  })

  it('updates a comment', async () => {
    const c = await store.createComment({ resource: '/blog/upd', userId: 'u1', body: 'orig' })
    const updated = await store.updateComment(c.id, 'edited')
    expect(updated.body).toBe('edited')
    expect(updated.id).toBe(c.id)
  })

  it('paginates top-level comments with cursors', async () => {
    // create 5 comments on a fresh resource
    const created: Comment[] = []
    for (let i = 0; i < 5; i++) {
      created.push(await store.createComment({ resource: '/blog/page', userId: 'u1', body: `c${i}` }))
    }
    const page1 = await store.listTopLevel('/blog/page', { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    const page2 = await store.listTopLevel('/blog/page', { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(2)
    // no overlap between pages
    const ids1 = new Set(page1.items.map(c => c.id))
    expect(page2.items.some(c => ids1.has(c.id))).toBe(false)
    const page3 = await store.listTopLevel('/blog/page', { limit: 2, cursor: page2.nextCursor! })
    expect(page3.items).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
  })

  it('hard-deletes a leaf comment (no replies)', async () => {
    const c = await store.createComment({ resource: '/blog/del', userId: 'u1', body: 'bye' })
    await store.deleteComment(c.id, 'author')
    const got = await store.getComment(c.id)
    expect(got).toBeNull()
  })

  it('soft-deletes a comment that has replies, preserving the thread', async () => {
    const top = await store.createComment({ resource: '/blog/soft', userId: 'u1', body: 'parent' })
    await store.createComment({ resource: '/blog/soft', userId: 'u2', body: 'child', parentId: top.id })
    await store.deleteComment(top.id, 'author')
    const got = await store.getComment(top.id)
    expect(got).not.toBeNull()
    expect(got!.body).toBeNull()
    expect(got!.deletedAt).not.toBeNull()
    expect(got!.deletedBy).toBe('author')
    const replies = await store.listReplies(top.id, { limit: 10 })
    expect(replies.items).toHaveLength(1)
  })

  it('addReaction: duplicate same-type reaction is idempotent', async () => {
    const c = await store.createComment({ resource: '/blog/react', userId: 'u1', body: 'c' })
    await store.addReaction({ commentId: c.id, userId: 'u3', type: 'like' })
    await store.addReaction({ commentId: c.id, userId: 'u3', type: 'like' })
    const reactions = await store.listReactionsForComments([c.id])
    const likes = reactions.filter(r => r.type === 'like' && r.userId === 'u3')
    expect(likes).toHaveLength(1)
  })

  it('removeReaction deletes the user reaction', async () => {
    const c = await store.createComment({ resource: '/blog/react2', userId: 'u1', body: 'c' })
    await store.addReaction({ commentId: c.id, userId: 'u4', type: 'heart' })
    await store.removeReaction(c.id, 'u4', 'heart')
    const reactions = await store.listReactionsForComments([c.id])
    expect(reactions.filter(r => r.userId === 'u4')).toHaveLength(0)
  })

  it('deleteUserData: removes reactions, soft-deletes comments with replies, hard-deletes leaves', async () => {
    const leaf = await store.createComment({ resource: '/blog/userdel', userId: 'victim', body: 'leaf' })
    const parent = await store.createComment({ resource: '/blog/userdel', userId: 'victim', body: 'parent' })
    await store.createComment({ resource: '/blog/userdel', userId: 'other', body: 'child', parentId: parent.id })
    const target = await store.createComment({ resource: '/blog/userdel', userId: 'other', body: 'target' })
    await store.addReaction({ commentId: target.id, userId: 'victim', type: 'like' })

    const result = await store.deleteUserData('victim')
    expect(result.reactions).toBeGreaterThanOrEqual(1)
    // leaf hard-deleted
    expect(await store.getComment(leaf.id)).toBeNull()
    // parent soft-deleted (has reply), thread preserved, author scrubbed
    const p = await store.getComment(parent.id)
    expect(p).not.toBeNull()
    expect(p!.body).toBeNull()
    expect(p!.authorName).toBeNull()
    expect(p!.authorImage).toBeNull()
    expect(p!.deletedBy).toBe('user-deletion')
    const replies = await store.listReplies(parent.id, { limit: 10 })
    expect(replies.items).toHaveLength(1)
    // victim's reactions gone
    const reactions = await store.getUserReactions('victim', [target.id])
    expect(reactions).toHaveLength(0)
  })

  it('deleteUserData: bulk scale (>100 parents + >100 leaves) is parameter-safe and reports exact counts', async () => {
    const PARENTS = 120
    const LEAVES = 120
    const REACTIONS = 150
    const ts = new Date().toISOString()

    // Seed directly (the store's create path would need hundreds of round
    // trips); ids are deterministic and unique to this test.
    const comments: D1PreparedStatement[] = []
    for (let i = 0; i < PARENTS; i++) {
      comments.push(env.DB.prepare(
        'INSERT INTO comments (id, resource, user_id, parent_id, body, author_name, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
      ).bind(`bulk-p-${i}`, 'bulk/site', 'bulk-victim', `parent ${i}`, 'Victim', ts, ts))
      comments.push(env.DB.prepare(
        'INSERT INTO comments (id, resource, user_id, parent_id, body, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(`bulk-r-${i}`, 'bulk/site', 'other', `bulk-p-${i}`, `reply ${i}`, 'Other', ts, ts))
    }
    for (let i = 0; i < LEAVES; i++) {
      comments.push(env.DB.prepare(
        'INSERT INTO comments (id, resource, user_id, parent_id, body, author_name, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
      ).bind(`bulk-l-${i}`, 'bulk/site', 'bulk-victim', `leaf ${i}`, 'Victim', ts, ts))
    }
    const reactions: D1PreparedStatement[] = []
    for (let i = 0; i < REACTIONS; i++) {
      // More reactions than leaves -> vary the type so the
      // UNIQUE(comment_id, user_id, type) key stays valid.
      const type = i < LEAVES ? 'like' : 'heart'
      reactions.push(env.DB.prepare(
        'INSERT INTO comment_reactions (id, comment_id, user_id, type, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(`bulk-rx-${i}`, `bulk-l-${i % LEAVES}`, 'bulk-victim', type, ts))
    }
    const seed = [...comments, ...reactions]
    for (let i = 0; i < seed.length; i += 50) await env.DB.batch(seed.slice(i, i + 50))

    const result = await store.deleteUserData('bulk-victim')

    // Counts reflect exactly what was changed: soft-deleted parents + hard-deleted leaves.
    expect(result.comments).toBe(PARENTS + LEAVES)
    expect(result.reactions).toBe(REACTIONS)

    // Every leaf is gone.
    const remainingLeaves = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM comments WHERE id LIKE 'bulk-l-%'`,
    ).first<{ c: number }>()
    expect(remainingLeaves!.c).toBe(0)

    // Every parent is a scrubbed, preserved tombstone.
    const preservedParents = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM comments
        WHERE id LIKE 'bulk-p-%' AND deleted_at IS NOT NULL
          AND deleted_by = 'user-deletion' AND body IS NULL AND author_name IS NULL`,
    ).first<{ c: number }>()
    expect(preservedParents!.c).toBe(PARENTS)

    // The other user's replies survive the thread.
    const survivingReplies = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM comments WHERE id LIKE 'bulk-r-%'`,
    ).first<{ c: number }>()
    expect(survivingReplies!.c).toBe(PARENTS)

    // No reaction owned by the deleted user remains.
    const remainingReactions = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM comment_reactions WHERE user_id = 'bulk-victim'`,
    ).first<{ c: number }>()
    expect(remainingReactions!.c).toBe(0)
  })
})
