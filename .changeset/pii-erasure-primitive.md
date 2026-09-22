---
"@graficos/nuxt-comments": minor
---

Add a user PII-erasure primitive and erase all personal data on user deletion.

- **New endpoint** `DELETE /api/_comments/users/:userId`. It erases the target
  user's comments-domain personal data. Authorization is server-side: the caller
  must be the user themself, or a moderator whose Better Auth session role
  matches the new server-only `comments.auth.adminRole` option (default
  `'admin'`). The role is read from the server session only — never from the
  request — and the check fails closed when no role is configured.
- **`deleteCommentsUser`** (server-only utility) now erases everything too.
- **Full erasure:** the user's reactions are hard-deleted, comments without
  replies are hard-deleted, and comments with replies become tombstones with
  `user_id`, `author_name`, `author_image` and `body` all set to `NULL` —
  including comments the user had already soft-deleted. No user id, name,
  avatar, body or reaction survives.
- **Migration required:** `migrations/0002_user_id_nullable.sql` makes
  `comments.user_id` nullable. Copy the new file (or re-point `migrations_dir`)
  and re-run `wrangler d1 migrations apply`.
- **Reserved prefix:** `users/` is now reserved alongside `threads/`; a resource
  id beginning with `users/` is rejected. If you used such a resource id, rename
  it before upgrading.
- Docs: new [privacy guide](./docs/privacy.md) covering the erasure primitive,
  the two-step account-deletion recipe, and the consumer's controller duties.
