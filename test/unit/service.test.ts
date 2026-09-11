import { describe, it, expect, beforeEach } from 'vitest'
import { createCommentsService, serviceConfigFromRuntimeConfig } from '../../src/runtime/server/services/comments.service'
import type { CommentsServiceConfig } from '../../src/runtime/server/services/comments.service'
import { CommentsApiError } from '../../src/runtime/server/utils/errors'
import type { CommentsStore, CreateCommentInput, CreateReactionInput, DeleteUserDataResult, ListOptions } from '../../src/runtime/server/repositories/comments-store'
import type { Comment, Paginated, Reaction, DeletionPolicy } from '../../src/runtime/shared/types'

/** In-memory CommentsStore fake for service-level logic tests. */
class MemoryStore implements CommentsStore {
  comments = new Map<string, Comment>()
  reactions = new Map<string, Reaction>()
  nextId = 0

  async listTopLevel(resource: string, opts?: ListOptions): Promise<Paginated<Comment>> {
    const items = [...this.comments.values()]
      .filter(c => c.resource === resource && c.parentId === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: items.slice(0, opts?.limit ?? 20), nextCursor: null, hasMore: false }
  }

  async listReplies(commentId: string, opts?: ListOptions): Promise<Paginated<Comment>> {
    const items = [...this.comments.values()]
      .filter(c => c.parentId === commentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: items.slice(0, opts?.limit ?? 20), nextCursor: null, hasMore: false }
  }

  async getComment(id: string): Promise<Comment | null> {
    return this.comments.get(id) ?? null
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const id = `c${this.nextId++}`
    const ts = new Date().toISOString()
    const comment: Comment = {
      id,
      resource: input.resource,
      userId: input.userId,
      parentId: input.parentId ?? null,
      body: input.body,
      authorName: input.authorName ?? null,
      authorImage: input.authorImage ?? null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      deletedBy: null,
    }
    this.comments.set(id, comment)
    return comment
  }

  async updateComment(id: string, body: string): Promise<Comment> {
    const c = this.comments.get(id)
    if (!c) throw new Error('not found')
    c.body = body
    c.updatedAt = new Date().toISOString()
    return c
  }

  async deleteComment(id: string, _policy: DeletionPolicy): Promise<void> {
    const c = this.comments.get(id)
    if (!c) return
    if ([...this.comments.values()].some(r => r.parentId === id)) {
      c.body = null
      c.deletedAt = new Date().toISOString()
      c.deletedBy = _policy
    }
    else {
      this.comments.delete(id)
    }
  }

  async hasReplies(commentId: string): Promise<boolean> {
    return [...this.comments.values()].some(c => c.parentId === commentId)
  }

  async listReactionsForComments(commentIds: string[]): Promise<Reaction[]> {
    return [...this.reactions.values()].filter(r => commentIds.includes(r.commentId))
  }

  async getUserReactions(userId: string, commentIds: string[]): Promise<Reaction[]> {
    return [...this.reactions.values()].filter(r => r.userId === userId && commentIds.includes(r.commentId))
  }

  async addReaction(input: CreateReactionInput): Promise<Reaction> {
    const existing = [...this.reactions.values()]
      .find(r => r.commentId === input.commentId && r.userId === input.userId && r.type === input.type)
    if (existing) return existing
    const r: Reaction = {
      id: `r${this.reactions.size}`,
      commentId: input.commentId,
      userId: input.userId,
      type: input.type,
      createdAt: new Date().toISOString(),
    }
    this.reactions.set(r.id, r)
    return r
  }

  async removeReaction(commentId: string, userId: string, type: string): Promise<void> {
    for (const [id, r] of this.reactions) {
      if (r.commentId === commentId && r.userId === userId && r.type === type) {
        this.reactions.delete(id)
      }
    }
  }

  async deleteUserData(userId: string): Promise<DeleteUserDataResult> {
    const comments = [...this.comments.values()].filter(c => c.userId === userId)
    const reactions = [...this.reactions.values()].filter(r => r.userId === userId)
    for (const r of reactions) this.reactions.delete(r.id)
    for (const c of comments) {
      if ([...this.comments.values()].some(x => x.parentId === c.id)) {
        c.body = null
        c.deletedAt = new Date().toISOString()
        c.deletedBy = 'user-deletion'
      }
      else {
        this.comments.delete(c.id)
      }
    }
    return { comments: comments.length, reactions: reactions.length }
  }
}

const CONFIG: CommentsServiceConfig = {
  reactionsEnabled: true,
  reactionTypes: ['like', 'heart'],
  maxBodyLength: 100,
  maxResourceLength: 512,
  defaultPageSize: 20,
  maxPageSize: 100,
  preserveThreadsWithReplies: true,
}

function makeService(opts?: {
  viewer?: { id: string, name: string | null, image: string | null } | null
  store?: MemoryStore
  config?: Partial<CommentsServiceConfig>
  limited?: boolean
}) {
  const store = opts?.store ?? new MemoryStore()
  const viewer = opts?.viewer === undefined ? { id: 'u1', name: 'Alice', image: null } : opts?.viewer
  return {
    store,
    service: createCommentsService({
      store,
      getViewer: async () => viewer,
      config: { ...CONFIG, ...opts?.config },
      checkRateLimit: async () => {
        if (opts?.limited) throw new CommentsApiError('rate_limited', 'too many requests')
      },
    }),
  }
}

let store: MemoryStore

beforeEach(() => {
  store = new MemoryStore()
})

describe('CommentsService', () => {
  describe('createComment', () => {
    it('requires authentication', async () => {
      const { service } = makeService({ viewer: null, store })
      await expect(service.createComment({ resource: 'blog/x', body: 'hi' }))
        .rejects.toMatchObject({ code: 'unauthenticated' })
    })
    it('creates a comment for an authenticated viewer', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: '/blog/x', body: 'hi' })
      expect(c.body).toBe('hi')
      expect(c.resource).toBe('blog/x') // normalized (leading slash stripped)
      expect(c.userId).toBe('u1')
      expect(c.authorName).toBe('Alice')
    })
    it('rejects an empty body', async () => {
      const { service } = makeService({ store })
      await expect(service.createComment({ resource: 'blog/x', body: '' }))
        .rejects.toMatchObject({ code: 'validation_failed' })
    })
    it('rejects a body exceeding maxBodyLength', async () => {
      const { service } = makeService({ store })
      await expect(service.createComment({ resource: 'blog/x', body: 'a'.repeat(101) }))
        .rejects.toMatchObject({ code: 'validation_failed' })
    })
    it('honors a configured maxResourceLength above 512', async () => {
      const { service } = makeService({ store, config: { maxResourceLength: 600 } })
      const c = await service.createComment({ resource: 'a'.repeat(600), body: 'hi' })
      expect(c.resource).toBe('a'.repeat(600))
    })
    it('rejects a resource over the configured limit with validation_failed', async () => {
      const { service } = makeService({ store, config: { maxResourceLength: 600 } })
      await expect(service.createComment({ resource: 'a'.repeat(601), body: 'hi' }))
        .rejects.toMatchObject({ code: 'validation_failed' })
    })
    it('rejects a parent from a different resource', async () => {
      const { service } = makeService({ store })
      const parent = await service.createComment({ resource: 'blog/a', body: 'p' })
      await expect(service.createComment({ resource: 'blog/b', body: 'r', parentId: parent.id }))
        .rejects.toMatchObject({ code: 'bad_request' })
    })
    it('rejects a reply to a deleted comment', async () => {
      const { service } = makeService({ store })
      const parent = await service.createComment({ resource: 'blog/a', body: 'p' })
      await store.deleteComment(parent.id, 'author')
      const revived = { ...parent, deletedAt: new Date().toISOString() } as Comment
      store.comments.set(parent.id, revived)
      await expect(service.createComment({ resource: 'blog/a', body: 'r', parentId: parent.id }))
        .rejects.toMatchObject({ code: 'bad_request' })
    })
    it('applies the rate limit', async () => {
      const { service } = makeService({ store, limited: true })
      await expect(service.createComment({ resource: 'blog/x', body: 'hi' }))
        .rejects.toMatchObject({ code: 'rate_limited' })
    })
  })

  describe('updateComment', () => {
    it('allows the author to edit', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'orig' })
      const updated = await service.updateComment(c.id, 'edited')
      expect(updated.body).toBe('edited')
    })
    it('rejects editing another user\'s comment', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'mine' })
      const other = makeService({ store, viewer: { id: 'u2', name: 'Bob', image: null } })
      await expect(other.service.updateComment(c.id, 'hacked'))
        .rejects.toMatchObject({ code: 'forbidden' })
    })
    it('requires authentication', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'p' })
      const anon = makeService({ store, viewer: null })
      await expect(anon.service.updateComment(c.id, 'x'))
        .rejects.toMatchObject({ code: 'unauthenticated' })
    })
  })

  describe('deleteComment', () => {
    it('allows the author to delete', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'bye' })
      await service.deleteComment(c.id)
      expect(await store.getComment(c.id)).toBeNull()
    })
    it('rejects deleting another user\'s comment', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'mine' })
      const other = makeService({ store, viewer: { id: 'u2', name: 'Bob', image: null } })
      await expect(other.service.deleteComment(c.id))
        .rejects.toMatchObject({ code: 'forbidden' })
    })
  })

  describe('reactions', () => {
    it('adds and removes a reaction with an allowed type', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'p' })
      const r = await service.addReaction(c.id, 'like')
      expect(r.type).toBe('like')
      await service.removeReaction(c.id, 'like')
      expect(await store.getUserReactions('u1', [c.id])).toHaveLength(0)
    })
    it('rejects a disallowed reaction type', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'p' })
      await expect(service.addReaction(c.id, 'laugh'))
        .rejects.toMatchObject({ code: 'validation_failed' })
    })
    it('rejects reactions when disabled', async () => {
      const { service } = makeService({ store, config: { reactionsEnabled: false } })
      const c = await service.createComment({ resource: 'blog/x', body: 'p' })
      await expect(service.addReaction(c.id, 'like'))
        .rejects.toMatchObject({ code: 'bad_request' })
    })
    it('rejects reactions on deleted comments', async () => {
      const { service } = makeService({ store })
      const c = await service.createComment({ resource: 'blog/x', body: 'p' })
      await store.deleteComment(c.id, 'author')
      await expect(service.addReaction(c.id, 'like'))
        .rejects.toMatchObject({ code: 'not_found' })
    })
  })

  describe('serviceConfigFromRuntimeConfig', () => {
    it('falls back to documented defaults', () => {
      const cfg = serviceConfigFromRuntimeConfig({})
      expect(cfg).toEqual({
        reactionsEnabled: true,
        reactionTypes: ['like'],
        maxBodyLength: 4000,
        maxResourceLength: 512,
        defaultPageSize: 20,
        maxPageSize: 100,
        preserveThreadsWithReplies: true,
      })
    })
    it('uses provided values', () => {
      const cfg = serviceConfigFromRuntimeConfig({
        reactions: { enabled: false, types: ['a', 'b'] },
        pagination: { pageSize: 5, maxPageSize: 10 },
      })
      expect(cfg.reactionsEnabled).toBe(false)
      expect(cfg.reactionTypes).toEqual(['a', 'b'])
      expect(cfg.defaultPageSize).toBe(5)
      expect(cfg.maxPageSize).toBe(10)
    })
  })
})
