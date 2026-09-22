# Privacy & data erasure

`@graficos/nuxt-comments` is a **tool**, not a data controller. Your application
(its operator) is the controller of the personal data stored in the comments
domain. This page explains what the package stores, what it can erase for you,
and what **you** must still provide to comply with data-protection rules such as
the GDPR.

> This is engineering documentation, not legal advice. Confirm your obligations
> with a qualified advisor.

## What personal data the comments domain stores

| Data | Where | Erased by this package |
|---|---|---|
| Author user id (the Better Auth user id) | `comments.user_id` | ✅ (nulled / row removed) |
| Display name snapshot | `comments.author_name` | ✅ |
| Avatar URL snapshot | `comments.author_image` | ✅ |
| Comment body (user-generated content) | `comments.body` | ✅ (nulled / row removed) |
| Reaction ownership | `comment_reactions.user_id` | ✅ (row removed) |

The package deliberately stores **no** email, no copy of Better Auth's
`user`/`session`/`account` tables, and no cross-site identifier. Identity is an
opaque `user_id` with no foreign key to the auth tables.

## The erasure primitive

There are two equivalent ways to erase a user's comments-domain data:

**HTTP** — self-service or moderation:

```http
DELETE /api/_comments/users/:userId
```

- The caller must be the user themself, **or** a moderator whose Better Auth
  session role matches `comments.auth.adminRole` (default `'admin'`).
- Authority is read from the **server** session only. The role name is
  server-only config and is never sent to the client.
- `401` if unauthenticated, `403` if authenticated but not allowed.

**Server-side** — from your own trusted code:

```ts
import { deleteCommentsUser } from '#comments/server'

const { comments, reactions } = await deleteCommentsUser(event, userId)
```

`deleteCommentsUser` performs **no authorization**; call it only behind your own
check (see [authentication.md#moderation--admin-role](./authentication.md#moderation--admin-role)).

### What erasure does

- **Reactions:** the user's rows are hard-deleted.
- **Comments without replies:** hard-deleted (row gone).
- **Comments with replies:** kept as a tombstone so the thread keeps its shape,
  but scrubbed to carry **no personal data** — `user_id`, `author_name`,
  `author_image` and `body` are all set to `NULL` (`deleted_by='user-deletion'`).
- Comments the user had **already** soft-deleted are scrubbed too.

No display name, avatar, body, or user id survives, regardless of prior delete
state.

## Account deletion is two steps

Erasing comments data does **not** delete the Better Auth user. A complete
account deletion erases both, and **order matters**: erase the comments data
while the session is still valid, then delete the auth user.

```ts
// server/api/me.delete.ts — your route, your authorization
import { deleteCommentsUser } from '#comments/server'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id

  // 1. erase the comments-domain PII (comments + reactions)
  await deleteCommentsUser(event, userId)

  // 2. delete the Better Auth user (sessions/accounts cascade per Better Auth)
  await auth.api.removeUser({ body: { userId } })

  return { success: true }
})
```

If you use the HTTP primitive instead, call it **before** the auth user is
removed, while the session still authenticates the caller.

## What you (the controller) must provide

The package cannot do these for you:

1. **A way to exercise erasure.** A profile/account page with a **"Delete my
   account"** button (self-service), or an equivalent documented request path.
   This is the GDPR Art. 17 right to erasure; the button should perform the
   two-step deletion above.
2. **A privacy policy** that discloses what comment data you store, why, how
   long you keep it, and how to delete it. Link it near the comment form.
3. **Retention.** Decide how long you keep comments and define what happens to
   **backups**. D1 backups/snapshots age out on their own schedule; document the
   window and ensure erased data does not live indefinitely in backups.
4. **Access & portability.** Be able to export a user's comments on request
   (Art. 15/20). The data is in your D1 database (`comments`, `comment_reactions`)
   — export it with your own query.
5. **No PII in logs.** Avoid logging bodies, names, avatars or user ids.
6. **Moderation.** If moderators can erase others' data, configure roles
   server-side (see below) and keep the authority check server-side.

## Moderation authority

Moderation uses Better Auth roles; the package only **reads** the role from the
server session. To let someone erase other users' data:

1. Enable Better Auth's [admin plugin](https://www.better-auth.com/docs/plugins/admin)
   (server + client) and apply its schema.
2. Create or promote an admin — `npx auth@latest create-admin --role admin`, or
   `auth.api.setRole({ body: { userId, role: 'admin' } })`.
3. Set `comments.auth.adminRole` to match the role string (default `'admin'`).

If roles are not configured, `session.user.role` is `null` and the endpoint
**fails closed**: only self-erasure is allowed. Full steps:
[authentication.md#moderation--admin-role](./authentication.md#moderation--admin-role).

## GDPR at a glance (informational)

| Right / duty | Article | How this package helps |
|---|---|---|
| Erasure | Art. 17 | `DELETE /api/_comments/users/:userId` / `deleteCommentsUser` erase all comment PII. |
| Information | Art. 13/14 | You disclose it in your privacy policy (not provided by the package). |
| Access / portability | Art. 15/20 | Data is plain rows in your D1 database; export with your own query. |
| Facilitation | Art. 12 | Self-service delete button (you build it) plus the primitive above. |
| Records | Art. 30 | Your processing records; the schema above lists the fields involved. |

The package provides the mechanism; the **controller duties remain yours**.
