import { ref, watch, type Ref } from 'vue'
import { useRuntimeConfig, createError } from '#imports'
import { $fetch } from 'ofetch'
import type { Comment } from '../../shared/types'

export interface UseCommentsOptions {
  /** Initial page size. Defaults to module pagination.pageSize. */
  limit?: number
}

export interface UseCommentsReturn {
  /** Top-level comments for the resource. */
  comments: Ref<Comment[]>
  loading: Ref<boolean>
  error: Ref<Error | null>
  hasMore: Ref<boolean>
  /** Replies loaded per comment id (lazy thread expansion). */
  repliesByComment: Ref<Record<string, Comment[]>>
  /** Replies currently expanded per comment id. */
  expanded: Ref<Record<string, boolean>>
  /** Whether more replies can be loaded, per comment id. */
  replyHasMore: Ref<Record<string, boolean>>
  /** Lazily fetch the next page of replies for a comment (used by the UI). */
  loadReplies: (commentId: string) => Promise<void>
  /** Toggle a thread's expansion, fetching replies on first expand. */
  toggleReplies: (commentId: string) => Promise<void>
  /** Load the next page of top-level comments. */
  fetchMore: () => Promise<void>
  /** Reload from the beginning. */
  refresh: () => Promise<void>
  /** Create a top-level comment. */
  createComment: (body: string) => Promise<Comment>
  /** Reply to an existing comment. */
  reply: (parentId: string, body: string) => Promise<Comment>
  /** Edit your own comment. */
  updateComment: (commentId: string, body: string) => Promise<Comment>
  /** Delete your own comment. */
  deleteComment: (commentId: string) => Promise<void>
  /** Toggle a reaction on a comment. */
  react: (commentId: string, type: string) => Promise<void>
  /** Remove a reaction of a given type. */
  unreact: (commentId: string, type: string) => Promise<void>
  /** Insert a newly created reply locally (newest first) and expand its thread. */
  appendReply: (comment: Comment) => void
  /** Patch a comment's reaction state locally, without reloading the list. */
  patchReaction: (commentId: string, type: string, active: boolean) => void
  /** Mark a comment as soft-deleted locally (top-level or nested reply). */
  patchDeleted: (commentId: string) => void
}

const API_BASE = '/api/_comments'

/**
 * Composable for interacting with the comments API for a given resource.
 *
 * Resource identifiers are opaque strings (see the resource contract in
 * the README). They are URL-encoded onto the API path.
 */
export function useComments(resource: string | Ref<string>, options?: UseCommentsOptions): UseCommentsReturn {
  const config = useRuntimeConfig()
  const defaultLimit = options?.limit ?? config.public.comments?.pagination?.pageSize ?? 20

  const resourceRef: Ref<string> = typeof resource === 'string' ? ref(resource) : resource
  const comments = ref<Comment[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const hasMore = ref(false)
  const nextCursor = ref<string | null>(null)

  // Lazy reply-thread state (per comment id).
  const repliesByComment = ref<Record<string, Comment[]>>({})
  const expanded = ref<Record<string, boolean>>({})
  const replyCursors = ref<Record<string, string | null>>({})
  const replyHasMore = ref<Record<string, boolean>>({})

  // Guards against out-of-order responses and duplicate requests.
  let loadSeq = 0
  let resourceEpoch = 0
  const repliesInFlight = new Set<string>()

  function resetThreadState() {
    repliesByComment.value = {}
    expanded.value = {}
    replyCursors.value = {}
    replyHasMore.value = {}
  }

  async function load(reset = false) {
    const seq = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const path = `${API_BASE}/${encodeResource(resourceRef.value)}`
      const payload = await $fetch<{
        items: Comment[]
        nextCursor: string | null
        hasMore: boolean
      }>(path, {
        query: {
          limit: defaultLimit,
          cursor: reset ? undefined : nextCursor.value,
        },
      })
      // A newer load started while this one was in flight: drop the stale result.
      if (seq !== loadSeq) return
      if (reset) comments.value = []
      comments.value = [...comments.value, ...payload.items]
      nextCursor.value = payload.nextCursor
      hasMore.value = payload.hasMore
    }
    catch (err) {
      if (seq !== loadSeq) return
      error.value = err instanceof Error ? err : createError(String(err))
    }
    finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  // Initial load + reload (and thread reset) when the resource changes.
  watch(resourceRef, () => {
    resourceEpoch++
    resetThreadState()
    void load(true)
  }, { immediate: true })

  async function loadReplies(commentId: string) {
    // Ignore a second request for a thread that is already loading.
    if (repliesInFlight.has(commentId)) return
    repliesInFlight.add(commentId)
    const epoch = resourceEpoch
    try {
      const payload = await $fetch<{
        items: Comment[]
        nextCursor: string | null
        hasMore: boolean
      }>(`${API_BASE}/threads/${encodeURIComponent(commentId)}/replies`, {
        query: {
          limit: defaultLimit,
          cursor: replyCursors.value[commentId] ?? undefined,
        },
      })
      // The resource changed while this was in flight: drop the stale result.
      if (epoch !== resourceEpoch) return
      repliesByComment.value = {
        ...repliesByComment.value,
        [commentId]: [...(repliesByComment.value[commentId] ?? []), ...payload.items],
      }
      replyCursors.value = { ...replyCursors.value, [commentId]: payload.nextCursor }
      replyHasMore.value = { ...replyHasMore.value, [commentId]: payload.hasMore }
    }
    finally {
      repliesInFlight.delete(commentId)
    }
  }

  async function toggleReplies(commentId: string) {
    if (expanded.value[commentId]) {
      expanded.value = { ...expanded.value, [commentId]: false }
      return
    }
    if (!repliesByComment.value[commentId]) {
      const epoch = resourceEpoch
      await loadReplies(commentId)
      // Don't expand a thread on a resource that has since changed.
      if (epoch !== resourceEpoch) return
    }
    expanded.value = { ...expanded.value, [commentId]: true }
  }

  async function fetchMore() {
    if (!hasMore.value || loading.value) return
    await load(false)
  }

  async function refresh() {
    await load(true)
  }

  async function createComment(body: string): Promise<Comment> {
    const path = `${API_BASE}/${encodeResource(resourceRef.value)}`
    return await $fetch<Comment>(path, { method: 'POST', body: { body } })
  }

  async function reply(parentId: string, body: string): Promise<Comment> {
    return await $fetch<Comment>(`${API_BASE}/threads/${parentId}/replies`, { method: 'POST', body: { body } })
  }

  async function updateComment(commentId: string, body: string): Promise<Comment> {
    return await $fetch<Comment>(`${API_BASE}/threads/${commentId}`, { method: 'PATCH', body: { body } })
  }

  async function deleteComment(commentId: string): Promise<void> {
    await $fetch(`${API_BASE}/threads/${commentId}`, { method: 'DELETE' })
  }

  async function react(commentId: string, type: string): Promise<void> {
    await $fetch(`${API_BASE}/threads/${commentId}/reactions`, { method: 'POST', body: { type: type } })
  }

  async function unreact(commentId: string, type: string): Promise<void> {
    await $fetch(`${API_BASE}/threads/${commentId}/reactions/${encodeURIComponent(type)}`, { method: 'DELETE' })
  }

  /** Insert a reply that was just created, newest first, and open its thread. */
  function appendReply(comment: Comment) {
    const parentId = comment.parentId
    if (!parentId) return
    repliesByComment.value = {
      ...repliesByComment.value,
      [parentId]: [comment, ...(repliesByComment.value[parentId] ?? [])],
    }
    expanded.value = { ...expanded.value, [parentId]: true }
  }

  /** Patch reaction counts/viewer state for a comment in place (optimistic UI). */
  function patchReaction(commentId: string, type: string, active: boolean) {
    function patch(c: Comment): Comment {
      if (c.id !== commentId) return c
      const counts = { ...(c.reactionCounts ?? {}) }
      const next = active ? (counts[type] ?? 0) + 1 : Math.max(0, (counts[type] ?? 0) - 1)
      const reactionCounts: Record<string, number> = {}
      for (const [key, value] of Object.entries(counts)) {
        if (key !== type) reactionCounts[key] = value
      }
      if (next > 0) reactionCounts[type] = next
      const viewerReactions = new Set(c.viewerReactions ?? [])
      if (active) viewerReactions.add(type)
      else viewerReactions.delete(type)
      return { ...c, reactionCounts, viewerReactions: [...viewerReactions] }
    }
    comments.value = comments.value.map(patch)
    const replies: Record<string, Comment[]> = {}
    for (const [id, list] of Object.entries(repliesByComment.value)) {
      replies[id] = list.map(patch)
    }
    repliesByComment.value = replies
  }

  /**
   * Mark a comment as soft-deleted locally so its `[deleted]` tombstone shows
   * immediately. Author deletion keeps the row (threads survive), so the reply
   * stays visible with its body cleared instead of vanishing.
   */
  function patchDeleted(commentId: string) {
    const ts = new Date().toISOString()
    function patch(c: Comment): Comment {
      if (c.id !== commentId) return c
      return { ...c, body: null, deletedAt: ts, deletedBy: 'author', reactionCounts: {}, viewerReactions: [] }
    }
    comments.value = comments.value.map(patch)
    const replies: Record<string, Comment[]> = {}
    for (const [id, list] of Object.entries(repliesByComment.value)) {
      replies[id] = list.map(patch)
    }
    repliesByComment.value = replies
  }

  return {
    comments,
    loading,
    error,
    hasMore,
    repliesByComment,
    expanded,
    replyHasMore,
    loadReplies,
    toggleReplies,
    fetchMore,
    refresh,
    createComment,
    reply,
    updateComment,
    deleteComment,
    react,
    unreact,
    appendReply,
    patchReaction,
    patchDeleted,
  }
}

/**
 * Build the API path for a resource. The canonical resource form has no
 * leading slash (see `normalizeResource`), which guarantees the value
 * round-trips through the `/api/_comments/:resource` URL.
 */
function encodeResource(resource: string): string {
  const canonical = resource.replace(/^\/+/, '')
  return canonical.split('/').map(encodeURIComponent).join('/')
}
