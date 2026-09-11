import type { Comment, Cursor, Reaction } from '../../shared/types'
import type { CommentsStore } from '../repositories/comments-store'
import type { ViewerInfo } from './auth'
import { normalizeResource, ResourceLengthError } from '../../shared/resource'
import {
  unauthenticated,
  forbidden,
  notFound,
  badRequest,
  validationFailed,
} from '../utils/errors'

export interface CommentsServiceConfig {
  reactionsEnabled: boolean
  reactionTypes: string[]
  maxBodyLength: number
  maxResourceLength: number
  defaultPageSize: number
  maxPageSize: number
  preserveThreadsWithReplies: boolean
}

export interface CommentsServiceDeps {
  store: CommentsStore
  getViewer: () => Promise<ViewerInfo | null>
  config: CommentsServiceConfig
  /**
   * Abuse-prevention extension point. Should throw a `rate_limited`
   * CommentsApiError when the current request exceeds the limit.
   * Mutations call this before performing any work.
   */
  checkRateLimit?: (scope: string) => Promise<void>
}

function attachReactions(
  comments: Comment[],
  allReactions: Reaction[],
  viewerReactions: Reaction[],
): void {
  for (const c of comments) {
    const counts: Record<string, number> = {}
    for (const r of allReactions) {
      if (r.commentId === c.id) counts[r.type] = (counts[r.type] ?? 0) + 1
    }
    c.reactionCounts = counts
    c.viewerReactions = viewerReactions.filter(r => r.commentId === c.id).map(r => r.type)
  }
}

function decodeCursor(cursor?: string): Cursor | undefined {
  if (!cursor) return undefined
  try {
    const decoded = JSON.parse(atob(cursor)) as Cursor
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') return undefined
    return decoded
  }
  catch {
    return undefined
  }
}

function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor))
}

function clampLimit(n: number | undefined, cfg: CommentsServiceConfig): number {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return cfg.defaultPageSize
  return Math.min(Math.floor(n), cfg.maxPageSize)
}

export function createCommentsService(deps: CommentsServiceDeps) {
  const { store, config } = deps
  const checkRateLimit = deps.checkRateLimit ?? (async () => {})

  async function listTopLevel(resource: string, opts?: { cursor?: string, limit?: number }): Promise<{
    items: Comment[]
    nextCursor: string | null
    hasMore: boolean
  }> {
    const limit = clampLimit(opts?.limit, config)
    const page = await store.listTopLevel(resource, { cursor: decodeCursor(opts?.cursor), limit })
    const viewer = await deps.getViewer()
    const ids = page.items.map(c => c.id)
    const allReactions = await store.listReactionsForComments(ids)
    const viewerReactions = viewer ? await store.getUserReactions(viewer.id, ids) : []
    attachReactions(page.items, allReactions, viewerReactions)
    return {
      items: page.items,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      hasMore: page.hasMore,
    }
  }

  async function listReplies(commentId: string, opts?: { cursor?: string, limit?: number }): Promise<{
    items: Comment[]
    nextCursor: string | null
    hasMore: boolean
  }> {
    const limit = clampLimit(opts?.limit, config)
    const parent = await store.getComment(commentId)
    if (!parent) throw notFound('comment not found')
    const page = await store.listReplies(commentId, { cursor: decodeCursor(opts?.cursor), limit })
    const viewer = await deps.getViewer()
    const ids = page.items.map(c => c.id)
    const allReactions = await store.listReactionsForComments(ids)
    const viewerReactions = viewer ? await store.getUserReactions(viewer.id, ids) : []
    attachReactions(page.items, allReactions, viewerReactions)
    return {
      items: page.items,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      hasMore: page.hasMore,
    }
  }

  async function createComment(input: {
    resource: string
    body: string
    parentId?: string | null
  }): Promise<Comment> {
    await checkRateLimit(input.parentId ? 'comments:reply' : 'comments:create')
    const viewer = await deps.getViewer()
    if (!viewer) throw unauthenticated()
    if (typeof input.body !== 'string' || input.body.length === 0) throw validationFailed('body must not be empty')
    if (input.body.length > config.maxBodyLength) throw validationFailed('body too long')

    let resource: string
    try {
      resource = normalizeResource(input.resource, config.maxResourceLength)
    }
    catch (err) {
      if (err instanceof ResourceLengthError) throw validationFailed('resource too long')
      throw badRequest('invalid resource identifier')
    }

    if (input.parentId) {
      const parent = await store.getComment(input.parentId)
      if (!parent) throw notFound('parent comment not found')
      if (parent.resource !== resource) throw badRequest('parent belongs to a different resource')
      if (parent.deletedAt) throw badRequest('cannot reply to a deleted comment')
    }

    return store.createComment({
      resource,
      userId: viewer.id,
      parentId: input.parentId ?? null,
      body: input.body,
      authorName: viewer.name,
      authorImage: viewer.image,
    })
  }

  async function updateComment(commentId: string, body: string): Promise<Comment> {
    await checkRateLimit('comments:update')
    const viewer = await deps.getViewer()
    if (!viewer) throw unauthenticated()
    if (typeof body !== 'string' || body.length === 0) throw validationFailed('body must not be empty')
    if (body.length > config.maxBodyLength) throw validationFailed('body too long')
    const existing = await store.getComment(commentId)
    if (!existing || existing.deletedAt) throw notFound('comment not found')
    if (existing.userId !== viewer.id) throw forbidden('you can only edit your own comments')
    return store.updateComment(commentId, body)
  }

  async function deleteComment(commentId: string): Promise<void> {
    await checkRateLimit('comments:delete')
    const viewer = await deps.getViewer()
    if (!viewer) throw unauthenticated()
    const existing = await store.getComment(commentId)
    if (!existing || existing.deletedAt) throw notFound('comment not found')
    if (existing.userId !== viewer.id) throw forbidden('you can only delete your own comments')
    await store.deleteComment(commentId, 'author')
  }

  async function addReaction(commentId: string, type: string): Promise<Reaction> {
    await checkRateLimit('comments:react')
    if (!config.reactionsEnabled) throw badRequest('reactions are disabled')
    if (!config.reactionTypes.includes(type)) throw validationFailed('reaction type not allowed')
    const viewer = await deps.getViewer()
    if (!viewer) throw unauthenticated()
    const comment = await store.getComment(commentId)
    if (!comment || comment.deletedAt) throw notFound('comment not found')
    return store.addReaction({ commentId, userId: viewer.id, type })
  }

  async function removeReaction(commentId: string, type: string): Promise<void> {
    await checkRateLimit('comments:react')
    if (!config.reactionsEnabled) throw badRequest('reactions are disabled')
    if (!config.reactionTypes.includes(type)) throw validationFailed('reaction type not allowed')
    const viewer = await deps.getViewer()
    if (!viewer) throw unauthenticated()
    await store.removeReaction(commentId, viewer.id, type)
  }

  /** Public: read a single comment (throws 404 when absent). */
  async function getComment(commentId: string): Promise<Comment> {
    const comment = await store.getComment(commentId)
    if (!comment) throw notFound('comment not found')
    return comment
  }

  return {
    listTopLevel,
    listReplies,
    getComment,
    createComment,
    updateComment,
    deleteComment,
    addReaction,
    removeReaction,
  }
}

export type CommentsService = ReturnType<typeof createCommentsService>

/** Build the service config from runtimeConfig.public.comments. */
export function serviceConfigFromRuntimeConfig(rc: {
  reactions?: { enabled?: boolean, types?: string[] }
  limits?: { maxBodyLength?: number, maxResourceLength?: number }
  pagination?: { pageSize?: number, maxPageSize?: number }
  softDelete?: { preserveThreadsWithReplies?: boolean }
}): CommentsServiceConfig {
  return {
    reactionsEnabled: rc.reactions?.enabled ?? true,
    reactionTypes: rc.reactions?.types ?? ['like'],
    maxBodyLength: rc.limits?.maxBodyLength ?? 4000,
    maxResourceLength: rc.limits?.maxResourceLength ?? 512,
    defaultPageSize: rc.pagination?.pageSize ?? 20,
    maxPageSize: rc.pagination?.maxPageSize ?? 100,
    preserveThreadsWithReplies: rc.softDelete?.preserveThreadsWithReplies ?? true,
  }
}
