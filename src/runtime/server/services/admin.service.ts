import type { H3Event } from 'h3'
import { getCommentsStore } from '../utils/get-store'
import type { DeleteUserDataResult } from '../repositories/comments-store'

/**
 * Admin operation: delete a user and all their comments-domain data.
 *
 * Deletion policy (documented in the README):
 *   - Reactions: hard-deleted.
 *   - Comments with replies: soft-deleted (`deleted_by='user-deletion'`),
 *     `author_name`/`author_image` nulled, so the thread is preserved
 *     and the author renders as `[deleted author]`.
 *   - Comments without replies: hard-deleted.
 *
 * This is a **server-only** utility. It is intentionally NOT exposed
 * as an unauthenticated HTTP endpoint. Consumers wire it behind their
 * own admin authorization (e.g. `requireUserSession(event, { user: { role: 'admin' } })`)
 * — see the playground for an example.
 *
 * The `event` argument is required to ensure this is called from a
 * trusted Nitro request context (which also provides the D1 binding).
 */
export async function deleteCommentsUser(event: H3Event, userId: string): Promise<DeleteUserDataResult> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('[nuxt-comments] deleteCommentsUser: userId is required')
  }
  const store = getCommentsStore(event)
  return store.deleteUserData(userId)
}
