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
  user_id: string
  parent_id: string | null
  body: string | null
  author_name: string | null
  author_image: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
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
          `SELECT * FROM comments WHERE resource = ? AND parent_id IS NULL
           AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
          .bind(resource, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.db.prepare(
          `SELECT * FROM comments WHERE resource = ? AND parent_id IS NULL
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
          `SELECT * FROM comments WHERE parent_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
          .bind(commentId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.db.prepare(
          `SELECT * FROM comments WHERE parent_id = ?
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
    const row = await this.db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first<CommentRow>()
    if (!row) throw new Error('failed to read back created comment')
    return rowToComment(row)
  }

  async updateComment(id: string, body: string): Promise<Comment> {
    const ts = now()
    await this.db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(body, ts, id)
      .run()
    const row = await this.db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first<CommentRow>()
    if (!row) throw new Error('comment not found after update')
    return rowToComment(row)
  }

  async deleteComment(id: string, policy: DeletionPolicy): Promise<void> {
    const ts = now()
    const hasReplies = await this.hasReplies(id)
    if (hasReplies) {
      // Soft-delete: preserve the thread structure.
      await this.db.prepare(
        'UPDATE comments SET body = NULL, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?',
      )
        .bind(ts, policy, ts, id)
        .run()
      // Reactions on the soft-deleted comment are removed (no reactions against a tombstone).
      await this.db.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').bind(id).run()
    }
    else {
      // Hard-delete (cascades to comment_reactions via FK ON DELETE CASCADE).
      await this.db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
    }
  }

  async hasReplies(commentId: string): Promise<boolean> {
    const row = await this.db.prepare(
      'SELECT 1 FROM comments WHERE parent_id = ? LIMIT 1',
    ).bind(commentId).first()
    return row !== null
  }

  async listReactionsForComments(commentIds: string[]): Promise<Reaction[]> {
    if (commentIds.length === 0) return []
    const placeholders = commentIds.map(() => '?').join(',')
    const stmt = this.db.prepare(
      `SELECT * FROM comment_reactions WHERE comment_id IN (${placeholders})`,
    ).bind(...commentIds)
    const { results } = await stmt.all<ReactionRow>()
    return results.map(rowToReaction)
  }

  async getUserReactions(userId: string, commentIds: string[]): Promise<Reaction[]> {
    if (commentIds.length === 0) return []
    const placeholders = commentIds.map(() => '?').join(',')
    const stmt = this.db.prepare(
      `SELECT * FROM comment_reactions WHERE user_id = ? AND comment_id IN (${placeholders})`,
    ).bind(userId, ...commentIds)
    const { results } = await stmt.all<ReactionRow>()
    return results.map(rowToReaction)
  }

  async addReaction(input: CreateReactionInput): Promise<Reaction> {
    const id = ulid()
    const ts = now()
    try {
      await this.db.prepare(
        `INSERT INTO comment_reactions (id, comment_id, user_id, type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(id, input.commentId, input.userId, input.type, ts)
        .run()
    }
    catch (err: unknown) {
      // SQLite UNIQUE constraint violation → return the existing reaction.
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint')) {
        const existing = await this.db.prepare(
          'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND type = ?',
        )
          .bind(input.commentId, input.userId, input.type)
          .first<ReactionRow>()
        if (existing) return rowToReaction(existing)
      }
      throw err
    }
    return { id, commentId: input.commentId, userId: input.userId, type: input.type, createdAt: ts }
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
    //   2. scrub author snapshots from every comment the user owns,
    //      including ones already soft-deleted before account deletion;
    //   3. soft-delete comments that anchor a thread;
    //   4. after (3), every remaining active comment is a leaf -> hard-delete.
    // A failure anywhere rolls the whole batch back, so the account is never
    // left half-erased.
    const [reactions, , preserved, removed] = await this.db.batch([
      this.db.prepare('DELETE FROM comment_reactions WHERE user_id = ?').bind(userId),
      this.db.prepare(
        'UPDATE comments SET author_name = NULL, author_image = NULL WHERE user_id = ?',
      ).bind(userId),
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
