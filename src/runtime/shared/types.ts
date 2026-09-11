/**
 * Display info for an author. The comments domain snapshots
 * `authorName`/`authorImage` on the comment row at creation time;
 * this type is exposed for convenience and future resolver use.
 */
export interface Author {
  id: string
  name: string | null
  image: string | null
}

export interface Comment {
  id: string
  /** Normalized resource identifier (opaque string). */
  resource: string
  /** Author user id. */
  userId: string
  /** Parent comment id. `null` for top-level comments. */
  parentId: string | null
  /** Original plain-text body. `null` when the comment has been soft-deleted. */
  body: string | null
  createdAt: string
  updatedAt: string
  /** Soft-delete timestamp. `null` when not deleted. */
  deletedAt: string | null
  /** Who deleted the comment: 'author' | 'user-deletion' | null */
  deletedBy: 'author' | 'user-deletion' | null
  /** Display name snapshot at creation time. Nulled on user-deletion. */
  authorName: string | null
  /** Avatar URL snapshot at creation time. Nulled on user-deletion. */
  authorImage: string | null
  /** Replies (populated only when fetched). */
  replies?: Comment[]
  /** Reaction counts keyed by type (populated only when fetched). */
  reactionCounts?: Record<string, number>
  /** Current viewer's reaction types on this comment. */
  viewerReactions?: string[]
}

export interface Reaction {
  id: string
  commentId: string
  userId: string
  type: string
  createdAt: string
}

/** Opaque cursor for cursor-based pagination. */
export interface Cursor {
  createdAt: string
  id: string
}

export interface Paginated<T> {
  items: T[]
  nextCursor: Cursor | null
  hasMore: boolean
}

export type DeletionPolicy = 'author' | 'user-deletion'

/** Error envelope returned by the comments API (h3 shape, package code in `data`). */
export interface CommentsError {
  statusCode: number
  statusMessage: string
  message: string
  data: {
    code: CommentsErrorCode
    message: string
  }
}

export type CommentsErrorCode
  = | 'bad_request'
    | 'unauthenticated'
    | 'forbidden'
    | 'not_found'
    | 'conflict'
    | 'validation_failed'
    | 'rate_limited'
    | 'internal'
