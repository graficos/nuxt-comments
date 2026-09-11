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

  async function load(reset = false) {
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
      if (reset) comments.value = []
      comments.value = [...comments.value, ...payload.items]
      nextCursor.value = payload.nextCursor
      hasMore.value = payload.hasMore
    }
    catch (err) {
      error.value = err instanceof Error ? err : createError(String(err))
    }
    finally {
      loading.value = false
    }
  }

  // Initial load + reload when the resource changes.
  watch(resourceRef, () => load(true), { immediate: true })

  // Lazy reply-thread state (per comment id).
  const repliesByComment = ref<Record<string, Comment[]>>({})
  const expanded = ref<Record<string, boolean>>({})
  const replyCursors = ref<Record<string, string | null>>({})
  const replyHasMore = ref<Record<string, boolean>>({})

  async function loadReplies(commentId: string) {
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
    repliesByComment.value = {
      ...repliesByComment.value,
      [commentId]: [...(repliesByComment.value[commentId] ?? []), ...payload.items],
    }
    replyCursors.value = { ...replyCursors.value, [commentId]: payload.nextCursor }
    replyHasMore.value = { ...replyHasMore.value, [commentId]: payload.hasMore }
  }

  async function toggleReplies(commentId: string) {
    if (expanded.value[commentId]) {
      expanded.value = { ...expanded.value, [commentId]: false }
      return
    }
    if (!repliesByComment.value[commentId]) {
      await loadReplies(commentId)
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
