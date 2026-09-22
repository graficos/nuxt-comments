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
  /** Author user id. `null` once the owner's data has been erased (user-deletion). */
  userId: string | null
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
  /**
   * Number of direct replies. Populated by the list endpoints so the UI can
   * decide whether to offer a thread toggle; `undefined` on single-row reads.
   */
  replyCount?: number
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

/**
 * Reaction state for a single comment, as returned by the batch reactions
 * endpoint. Kept out of the content endpoints so the comment list stays public
 * and cacheable while reactions hydrate client-side.
 */
export interface ReactionSummary {
  commentId: string
  counts: Record<string, number>
  viewerReactions: string[]
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

/**
 * Classes applied to the rendered layers and controls of a comment.
 *
 * The package is unstyled; these let a consumer target every wrapper and
 * button without relying on structural selectors. All keys are optional.
 */
export interface CommentClasses {
  /** Root `<article>`. */
  root?: string
  /** Row wrapping the action buttons and the reactions. */
  footer?: string
  /** Wrapper around the reply/edit/delete buttons. */
  actions?: string
  /** Wrapper around the reaction buttons. */
  reactions?: string
  /** Wrapper around the reply thread (toggle + list). */
  replies?: string
  /** The replies `<ol>` (`data-nc-replies-list`). */
  repliesList?: string
  /** Each `<li>` in the replies list (including the load-more item). */
  replyItem?: string
  /** Reply button. */
  replyButton?: string
  /** Edit button. */
  editButton?: string
  /** Delete button. */
  deleteButton?: string
  /** Each reaction button. */
  reactionButton?: string
  /** "View replies" toggle button. */
  viewRepliesButton?: string
  /** "Load more replies" button. */
  loadMoreRepliesButton?: string
}

/** Classes applied to the layers of `<Comments>`. */
export interface CommentsClasses {
  /** Root `<section>`. */
  root?: string
  /** The top-level `<ol>`. */
  list?: string
  /** The "Load more" button. */
  loadMoreButton?: string
}

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
    | 'validation_failed'
    | 'rate_limited'
    | 'internal'
