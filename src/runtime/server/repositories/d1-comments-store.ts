import { ulid } from 'ulidx'
import type { D1Database } from '@cloudflare/workers-types'
import type {
  Comment,
  Paginated,
  Reaction,
  DeletionPolicy,
} from '../../shared/types'
import type {
  CommentsStore,
  ListOptions,
  CreateCommentInput,
  CreateReactionInput,
  DeleteUserDataResult,
} from './comments-store'

interface CommentRow {
  id: string
  resource: string
  user_id: string | null
  parent_id: string | null
  body: string | null
  author_name: string | null
  author_image: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
  /** Present on list queries only (correlated COUNT subquery). */
  reply_count?: number
}

interface ReactionRow {
  id: string
  comment_id: string
  user_id: string
  type: string
  created_at: string
}

function now(): string {
  return new Date().toISOString()
}

/** Cloudflare D1 allows at most 100 bound parameters per statement. */
const D1_MAX_BOUND_PARAMS = 100

/** Split a list into fixed-size chunks (used to stay under D1's param cap). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    resource: row.resource,
    userId: row.user_id,
    parentId: row.parent_id,
    body: row.body,
    authorName: row.author_name,
    authorImage: row.author_image,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by as Comment['deletedBy'],
    ...(row.reply_count !== undefined ? { replyCount: row.reply_count } : {}),
  }
}

function rowToReaction(row: ReactionRow): Reaction {
  return {
    id: row.id,
    commentId: row.comment_id,
    userId: row.user_id,
    type: row.type,
    createdAt: row.created_at,
  }
}

/**
 * CommentsStore implementation backed by Cloudflare D1.
 *
 * Uses parameterized prepared statements throughout. The binding is
 * resolved by the caller (see `get-store.ts`); this class is agnostic
 * to the binding name. Author display info is snapshot-embedded on the
 * comment row at creation time (decouples reads from auth, degrades
 * gracefully on user deletion).
 */
export class D1CommentsStore implements CommentsStore {
  constructor(private readonly db: D1Database) {}

  async listTopLevel(resource: string, opts?: ListOptions): Promise<Paginated<Comment>> {
    const limit = Math.min(opts?.limit ?? 20, 100)
    const cursor = opts?.cursor
    const stmt = cursor
      ? this.db.prepare(
          `SELECT *, (SELECT COUNT(*) FROM comments r WHERE r.parent_id = comments.id) AS reply_count
           FROM comments WHERE resource = ? AND parent_id IS NULL
           AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
          .bind(resource, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.db.prepare(
          `SELECT *, (SELECT COUNT(*) FROM comments r WHERE r.parent_id = comments.id) AS reply_count
           FROM comments WHERE resource = ? AND parent_id IS NULL
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        ).bind(resource, limit + 1)
    const { results } = await stmt.all<CommentRow>()
    return paginate(results.map(rowToComment), limit)
  }

  async listReplies(commentId: string, opts?: ListOptions): Promise<Paginated<Comment>> {
    const limit = Math.min(opts?.limit ?? 20, 100)
    const cursor = opts?.cursor
    const stmt = cursor
      ? this.db.prepare(
          `SELECT *, (SELECT COUNT(*) FROM comments r WHERE r.parent_id = comments.id) AS reply_count
           FROM comments WHERE parent_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
          .bind(commentId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.db.prepare(
          `SELECT *, (SELECT COUNT(*) FROM comments r WHERE r.parent_id = comments.id) AS reply_count
           FROM comments WHERE parent_id = ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        ).bind(commentId, limit + 1)
    const { results } = await stmt.all<CommentRow>()
    return paginate(results.map(rowToComment), limit)
  }

  async getComment(id: string): Promise<Comment | null> {
    const row = await this.db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first<CommentRow>()
    return row ? rowToComment(row) : null
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const id = ulid()
    const ts = now()
    await this.db.prepare(
      `INSERT INTO comments
         (id, resource, user_id, parent_id, body, author_name, author_image, created_at, updated_at, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
      .bind(
        id, input.resource, input.userId, input.parentId ?? null, input.body,
        input.authorName ?? null, input.authorImage ?? null,
        ts, ts,
      )
      .run()
    // Build the row from known values rather than re-reading it: a failed
    // read-back would surface an already-committed write as an error.
    return {
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
      replyCount: 0,
    }
  }

  async updateComment(id: string, body: string): Promise<Comment> {
    const ts = now()
    // RETURNING makes the write and the read one statement, so a successful
    // update can never be reported as a failure.
    const row = await this.db.prepare(
      'UPDATE comments SET body = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING *',
    )
      .bind(body, ts, id)
      .first<CommentRow>()
    if (!row) throw new Error('comment not found')
    return rowToComment(row)
  }

  async deleteComment(id: string, policy: DeletionPolicy): Promise<void> {
    const ts = now()
    // Author deletion always leaves a tombstone (`[deleted]`) so replies keep
    // their thread context and the UI behaves the same for comments and replies.
    // Admin user-deletion still hard-deletes leaves.
    if (policy === 'user-deletion') {
      // Delete only when the comment has no replies. The NOT EXISTS is part of
      // the same statement, so a reply inserted concurrently cannot turn this
      // into an FK RESTRICT error.
      const res = await this.db.prepare(
        `DELETE FROM comments WHERE id = ?
           AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = ?)`,
      ).bind(id, id).run()
      if ((res.meta.changes ?? 0) > 0) {
        // Hard-delete (cascades to comment_reactions via FK ON DELETE CASCADE).
        return
      }
    }
    // Keep a tombstone and clear reactions. On `user-deletion` the tombstone
    // must carry no personal data, so the user id is nulled too; an author's
    // own soft-delete keeps ownership (the id is erased later, on account
    // deletion).
    await this.db.prepare(
      policy === 'user-deletion'
        ? 'UPDATE comments SET user_id = NULL, body = NULL, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
        : 'UPDATE comments SET body = NULL, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(ts, policy, ts, id)
      .run()
    await this.db.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').bind(id).run()
  }

  async hasReplies(commentId: string): Promise<boolean> {
    const row = await this.db.prepare(
      'SELECT 1 FROM comments WHERE parent_id = ? LIMIT 1',
    ).bind(commentId).first()
    return row !== null
  }

  async listReactionsForComments(commentIds: string[]): Promise<Reaction[]> {
    if (commentIds.length === 0) return []
    const out: Reaction[] = []
    for (const ids of chunk(commentIds, D1_MAX_BOUND_PARAMS)) {
      const placeholders = ids.map(() => '?').join(',')
      const { results } = await this.db.prepare(
        `SELECT * FROM comment_reactions WHERE comment_id IN (${placeholders})`,
      ).bind(...ids).all<ReactionRow>()
      out.push(...results.map(rowToReaction))
    }
    return out
  }

  async getUserReactions(userId: string, commentIds: string[]): Promise<Reaction[]> {
    if (commentIds.length === 0) return []
    const out: Reaction[] = []
    // `userId` consumes one bound parameter, so chunks are one smaller.
    for (const ids of chunk(commentIds, D1_MAX_BOUND_PARAMS - 1)) {
      const placeholders = ids.map(() => '?').join(',')
      const { results } = await this.db.prepare(
        `SELECT * FROM comment_reactions WHERE user_id = ? AND comment_id IN (${placeholders})`,
      ).bind(userId, ...ids).all<ReactionRow>()
      out.push(...results.map(rowToReaction))
    }
    return out
  }

  async addReaction(input: CreateReactionInput): Promise<Reaction> {
    const id = ulid()
    const ts = now()
    // ON CONFLICT makes a duplicate reaction a no-op without depending on the
    // SQLite error-message text.
    await this.db.prepare(
      `INSERT INTO comment_reactions (id, comment_id, user_id, type, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(comment_id, user_id, type) DO NOTHING`,
    )
      .bind(id, input.commentId, input.userId, input.type, ts)
      .run()
    const row = await this.db.prepare(
      'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND type = ?',
    )
      .bind(input.commentId, input.userId, input.type)
      .first<ReactionRow>()
    if (!row) throw new Error('failed to read back reaction')
    return rowToReaction(row)
  }

  async removeReaction(commentId: string, userId: string, type: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND type = ?',
    )
      .bind(commentId, userId, type)
      .run()
  }

  async deleteUserData(userId: string): Promise<DeleteUserDataResult> {
    const ts = now()
    // One atomic transaction, no IN-lists: every statement binds a fixed
    // number of parameters, so this scales past D1's 100-bound-parameter
    // limit. Statements run in order within the batch:
    //   1. drop the user's reactions;
    //   2. soft-delete comments that anchor a thread (they must survive so the
    //      thread keeps its context), keeping user_id for step 4's filter;
    //   3. after (2), every remaining active comment is a leaf -> hard-delete;
    //   4. scrub the survivors: null user_id, author_name and author_image on
    //      every row that still carries the user id, including tombstones the
    //      user had already soft-deleted before account deletion.
    // No personal data is left behind, and a failure anywhere rolls the whole
    // batch back, so the account is never left half-erased.
    const [reactions, preserved, removed] = await this.db.batch([
      this.db.prepare('DELETE FROM comment_reactions WHERE user_id = ?').bind(userId),
      this.db.prepare(
        `UPDATE comments
           SET body = NULL, deleted_at = ?, deleted_by = 'user-deletion', updated_at = ?
         WHERE user_id = ? AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = comments.id)`,
      ).bind(ts, ts, userId),
      this.db.prepare(
        `DELETE FROM comments
         WHERE user_id = ? AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = comments.id)`,
      ).bind(userId),
      this.db.prepare(
        'UPDATE comments SET user_id = NULL, author_name = NULL, author_image = NULL WHERE user_id = ?',
      ).bind(userId),
    ])

    return {
      comments: (preserved!.meta.changes ?? 0) + (removed!.meta.changes ?? 0),
      reactions: reactions!.meta.changes ?? 0,
    }
  }
}

function paginate(items: Comment[], limit: number): Paginated<Comment> {
  const hasMore = items.length > limit
  const slice = hasMore ? items.slice(0, limit) : items
  const last = slice[slice.length - 1]
  const nextCursor = hasMore && last
    ? { createdAt: last.createdAt, id: last.id }
    : null
  return {
    items: slice,
    nextCursor,
    hasMore,
  }
}
