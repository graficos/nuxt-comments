import { ref, watch, computed, type Ref } from 'vue'
import { useRuntimeConfig, createError, useAsyncData, useRequestFetch } from '#imports'
import { $fetch } from 'ofetch'
import type { Comment, ReactionSummary } from '../../shared/types'

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

interface CommentPage {
  items: Comment[]
  nextCursor: string | null
  hasMore: boolean
}

const API_BASE = '/api/_comments'

/**
 * Composable for interacting with the comments API for a given resource.
 *
 * The top-level comment list is server-rendered through `useAsyncData` (public
 * content, cacheable). Reactions are per-viewer and therefore **not** part of
 * the content responses: they hydrate on the client through the batch reactions
 * endpoint and are patched locally on mutation.
 *
 * Resource identifiers are opaque strings (see the resource contract in
 * the README). They are URL-encoded onto the API path.
 */
export function useComments(resource: string | Ref<string>, options?: UseCommentsOptions): UseCommentsReturn {
  const config = useRuntimeConfig()
  const defaultLimit = options?.limit ?? config.public.comments?.pagination?.pageSize ?? 20

  const resourceRef: Ref<string> = typeof resource === 'string' ? ref(resource) : resource

  // SSR needs a request-aware fetch (relative URLs resolve against the request);
  // the browser can use `$fetch` directly.
  const requestFetch = (import.meta.server ? useRequestFetch() : $fetch) as typeof $fetch

  const comments = ref<Comment[]>([])
  const fetchingMore = ref(false)
  const error = ref<Error | null>(null)
  const hasMore = ref(false)
  const nextCursor = ref<string | null>(null)

  // Lazy reply-thread state (per comment id).
  const repliesByComment = ref<Record<string, Comment[]>>({})
  const expanded = ref<Record<string, boolean>>({})
  const replyCursors = ref<Record<string, string | null>>({})
  const replyHasMore = ref<Record<string, boolean>>({})

  // Guards against out-of-order responses and duplicate requests.
  let resourceEpoch = 0
  const repliesInFlight = new Set<string>()
  // Comment ids whose reactions have already been hydrated for this resource.
  const hydratedIds = new Set<string>()

  // Reaction-hydration batching state. Declared here rather than with the rest
  // of the hydration block below because the `immediate` + `sync` watcher on
  // `initial.data` calls `scheduleReactionHydration` during setup — before any
  // later `let` would be initialized (TDZ).
  let reactionQueue: Comment[] = []
  let reactionFlushScheduled = false
  // Comment ids with a local reaction mutation (optimistic patch). A hydration
  // response that was already in flight when the user reacted must not clobber
  // that newer local state.
  const locallyPatchedReactions = new Set<string>()

  function resetThreadState() {
    repliesByComment.value = {}
    expanded.value = {}
    replyCursors.value = {}
    replyHasMore.value = {}
  }

  function fetchPage(resource: string, cursor?: string | null): Promise<CommentPage> {
    const path = `${API_BASE}/${encodeResource(resource)}`
    return requestFetch<CommentPage>(path, {
      query: { limit: defaultLimit, cursor: cursor ?? undefined },
    })
  }

  // Initial page: fetched during SSR, serialized into the payload, and hydrated
  // on the client. `watch` refetches when the resource changes.
  //
  // Prerender runs at build time without a request runtime or database binding,
  // so skip the server fetch there and let the client load the first page after
  // hydration (the component shows its loading state in the prerendered HTML).
  const initial = useAsyncData(
    () => `nuxt-comments:${resourceRef.value}:${defaultLimit}`,
    () => fetchPage(resourceRef.value),
    {
      watch: [resourceRef],
      server: !import.meta.prerender,
      default: (): CommentPage => ({ items: [], nextCursor: null, hasMore: false }),
    },
  )

  watch(resourceRef, () => {
    resourceEpoch++
    hydratedIds.clear()
    locallyPatchedReactions.clear()
    resetThreadState()
  })

  watch(initial.data, (page) => {
    if (!page) return
    // `useAsyncData` can re-emit the same page; preserve any reaction state we
    // already hydrated (or patched locally) instead of clobbering it.
    const existing = new Map(comments.value.map(c => [c.id, c]))
    comments.value = page.items.map((c) => {
      const prev = existing.get(c.id)
      return prev ? { ...c, reactionCounts: prev.reactionCounts, viewerReactions: prev.viewerReactions } : c
    })
    nextCursor.value = page.nextCursor
    hasMore.value = page.hasMore
    scheduleReactionHydration(page.items)
  }, { immediate: true, flush: 'sync' })

  watch(initial.error, (err) => {
    if (err) error.value = err as unknown as Error
  }, { flush: 'sync' })

  // `idle` means the first fetch has not run yet — on a prerendered page the
  // server skips it (`server: false`), so treat idle as loading to render the
  // loading state instead of the empty state, and keep SSR/hydration aligned.
  const loading = computed(() =>
    initial.pending.value || initial.status.value === 'idle' || fetchingMore.value,
  )

  async function fetchMore() {
    if (!hasMore.value || fetchingMore.value) return
    fetchingMore.value = true
    const epoch = resourceEpoch
    try {
      const page = await fetchPage(resourceRef.value, nextCursor.value)
      // A newer resource replaced this one while in flight: drop the result.
      if (epoch !== resourceEpoch) return
      comments.value = [...comments.value, ...page.items]
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
      scheduleReactionHydration(page.items)
    }
    catch (err) {
      if (epoch !== resourceEpoch) return
      error.value = err instanceof Error ? err : createError(String(err))
    }
    finally {
      if (epoch === resourceEpoch) fetchingMore.value = false
    }
  }

  async function refresh() {
    resourceEpoch++
    hydratedIds.clear()
    locallyPatchedReactions.clear()
    resetThreadState()
    await initial.refresh()
  }

  async function loadReplies(commentId: string) {
    // Ignore a second request for a thread that is already loading.
    if (repliesInFlight.has(commentId)) return
    repliesInFlight.add(commentId)
    const epoch = resourceEpoch
    try {
      const payload = await requestFetch<CommentPage>(`${API_BASE}/threads/${encodeURIComponent(commentId)}/replies`, {
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
      scheduleReactionHydration(payload.items)
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

  // --- Reaction hydration (client only) -------------------------------------
  // Reactions are not part of the content responses, so they are fetched in a
  // single batch once comments arrive and merged in. Batching across the
  // initial page and lazy reply loads avoids one request per comment.
  // (`reactionQueue` / `reactionFlushScheduled` are declared near the top.)
  function scheduleReactionHydration(items: Comment[]) {
    if (!import.meta.client || items.length === 0) return
    const fresh = items.filter(c => !hydratedIds.has(c.id))
    if (fresh.length === 0) return
    for (const c of fresh) hydratedIds.add(c.id)
    reactionQueue.push(...fresh)
    if (reactionFlushScheduled) return
    reactionFlushScheduled = true
    queueMicrotask(() => {
      reactionFlushScheduled = false
      const batch = reactionQueue
      reactionQueue = []
      void hydrateReactions(batch)
    })
  }

  async function hydrateReactions(items: Comment[]) {
    const ids = [...new Set(items.map(c => c.id))]
    if (ids.length === 0) return
    try {
      const payload = await requestFetch<{ items: ReactionSummary[] }>(`${API_BASE}/threads/reactions`, {
        query: { ids: ids.join(',') },
      })
      applyReactionSummaries(payload.items)
    }
    catch {
      // Reactions are non-critical: a failed hydration must not surface as a
      // load error (which would replace the list) or block content.
    }
  }

  function applyReactionSummaries(summaries: ReactionSummary[]) {
    if (summaries.length === 0) return
    const byId = new Map(summaries.map(s => [s.commentId, s]))
    function patch(c: Comment): Comment {
      const summary = byId.get(c.id)
      if (!summary) return c
      // Skip comments whose reaction state was mutated locally (optimistic
      // toggle) after this hydration request was sent.
      if (locallyPatchedReactions.has(c.id)) return c
      return { ...c, reactionCounts: summary.counts, viewerReactions: summary.viewerReactions }
    }
    comments.value = comments.value.map(patch)
    const replies: Record<string, Comment[]> = {}
    for (const [id, list] of Object.entries(repliesByComment.value)) {
      replies[id] = list.map(patch)
    }
    repliesByComment.value = replies
  }

  async function createComment(body: string): Promise<Comment> {
    const path = `${API_BASE}/${encodeResource(resourceRef.value)}`
    return await requestFetch<Comment>(path, { method: 'POST', body: { body } })
  }

  async function reply(parentId: string, body: string): Promise<Comment> {
    return await requestFetch<Comment>(`${API_BASE}/threads/${parentId}/replies`, { method: 'POST', body: { body } })
  }

  async function updateComment(commentId: string, body: string): Promise<Comment> {
    const updated = await requestFetch<Comment>(`${API_BASE}/threads/${commentId}`, { method: 'PATCH', body: { body } })
    // Reflect the edit in place so the UI updates without a refetch. Only the
    // server-owned fields are copied; reaction/reply state stays intact.
    patchComment(commentId, { body: updated.body, updatedAt: updated.updatedAt })
    return updated
  }

  async function deleteComment(commentId: string): Promise<void> {
    await requestFetch(`${API_BASE}/threads/${commentId}`, { method: 'DELETE' })
  }

  async function react(commentId: string, type: string): Promise<void> {
    await requestFetch(`${API_BASE}/threads/${commentId}/reactions`, { method: 'POST', body: { type } })
  }

  async function unreact(commentId: string, type: string): Promise<void> {
    await requestFetch(`${API_BASE}/threads/${commentId}/reactions/${encodeURIComponent(type)}`, { method: 'DELETE' })
  }

  /** Patch a comment in place (top-level or nested reply) with the given changes. */
  function patchComment(commentId: string, changes: Partial<Comment>) {
    function patch(c: Comment): Comment {
      return c.id === commentId ? { ...c, ...changes } : c
    }
    comments.value = comments.value.map(patch)
    const replies: Record<string, Comment[]> = {}
    for (const [id, list] of Object.entries(repliesByComment.value)) {
      replies[id] = list.map(patch)
    }
    repliesByComment.value = replies
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
    locallyPatchedReactions.add(commentId)
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
