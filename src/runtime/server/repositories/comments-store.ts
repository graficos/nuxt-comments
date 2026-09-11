import type { Comment, Cursor, Paginated, Reaction, DeletionPolicy } from '../../shared/types'

export interface ListOptions {
  /** Decoded cursor (created_at + id). */
  cursor?: Cursor
  limit?: number
}

export interface CreateCommentInput {
  resource: string
  userId: string
  parentId?: string | null
  body: string
  /** Display name snapshot at creation time. */
  authorName?: string | null
  /** Avatar URL snapshot at creation time. */
  authorImage?: string | null
}

export interface CreateReactionInput {
  commentId: string
  userId: string
  type: string
}

export interface DeleteUserDataResult {
  comments: number
  reactions: number
}

/**
 * Persistence boundary for the comments domain.
 *
 * The domain/application layer depends on this interface, not on any
 * concrete backend. The MVP ships `D1CommentsStore`; a future GitHub
 * Discussions adapter/mirror could be added by implementing this
 * interface (or by mirroring via D1 → Queue → GitHub).
 *
 * Implementations must NOT enforce authorization — that is the
 * service layer's responsibility. The store is a data-access primitive.
 */
export interface CommentsStore {
  listTopLevel(resource: string, opts?: ListOptions): Promise<Paginated<Comment>>
  listReplies(commentId: string, opts?: ListOptions): Promise<Paginated<Comment>>
  getComment(id: string): Promise<Comment | null>
  createComment(input: CreateCommentInput): Promise<Comment>
  updateComment(id: string, body: string): Promise<Comment>
  deleteComment(id: string, policy: DeletionPolicy): Promise<void>
  listReactionsForComments(commentIds: string[]): Promise<Reaction[]>
  getUserReactions(userId: string, commentIds: string[]): Promise<Reaction[]>
  addReaction(input: CreateReactionInput): Promise<Reaction>
  removeReaction(commentId: string, userId: string, type: string): Promise<void>
  deleteUserData(userId: string): Promise<DeleteUserDataResult>
  /** Internal helper: does this comment have any replies? */
  hasReplies(commentId: string): Promise<boolean>
}
