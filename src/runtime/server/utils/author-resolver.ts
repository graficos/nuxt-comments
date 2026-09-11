import type { Author } from '../../shared/types'

/**
 * Port: resolve display info (name/image) for a set of user ids.
 *
 * The MVP snapshots `author_name`/`author_image` on the comment row at
 * creation time, so reads do not need to resolve authors against the
 * auth backend — this decouples reads from Better Auth entirely and
 * degrades gracefully on user deletion.
 *
 * This port is retained as an extension point: a consumer could
 * implement a resolver that enriches author info on read (e.g. to pick
 * up display-name changes), or a future GitHub adapter could resolve
 * GitHub logins. It is optional and not wired by default.
 */
export interface AuthorResolver {
  resolve(userIds: string[]): Promise<Map<string, Author>>
}

export const DELETED_AUTHOR: Author = { id: '__deleted__', name: null, image: null }
