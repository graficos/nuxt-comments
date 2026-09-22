# @graficos/nuxt-comments

## 0.5.0

### Minor Changes

- 179b8b9: Add a user PII-erasure primitive and erase all personal data on user deletion.
  
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
- 0d663cb: Server-render the comment list; hydrate reactions client-side.
  
  - `useComments` now fetches the top-level page with `useAsyncData`, so comments
    are present in the SSR HTML and payload instead of rendering client-only.
    `useComments` keeps the same public API.
  - Reactions are per-viewer and dynamic, so they are no longer embedded in the
    content responses. `resource.get` / `replies.get` return comments without
    `reactionCounts` / `viewerReactions`; the client fetches them in one batch
    from `GET /api/_comments/threads/reactions?ids=...` after hydration and merges
    them in. This keeps the SSR payload cacheable and free of viewer state.
  - `useComments`' list is safe to use outside `<ClientOnly>` now.
  - On **prerendered** pages there is no request runtime/database at build time, so
    the server fetch is skipped there (`server: !import.meta.prerender`); the client
    loads the first page after hydration and the prerendered HTML shows the loading
    state. Runtime SSR pages still server-render the list.
  
  Also fixes the server session helper: `getUserSession` is imported by name from
  `#imports` instead of a namespace import, which resolved to `undefined` in the
  real Nitro server build (it worked only in the isolated test mock).

### Patch Changes

- 0d663cb: Hide actions and reactions on deleted comments, and reflect edits in place.
  
  - A soft-deleted comment (or reply) no longer renders the action row, so its
    reaction buttons cannot be clicked. Reacting to a deleted comment previously
    failed server-side (`not_found`) and replaced the whole list with the error
    state. A deleted comment's reply-thread toggle still renders when it has replies.
  - `useComments.updateComment` now patches the edited comment — top-level or a
    nested reply — in place, so an edit shows immediately without a refetch.

## 0.4.0

### Minor Changes

- 7f28e3f: Namespace all component data attributes under `data-nc-*`.
  
  Every `data-*` hook emitted by the components now uses the `data-nc-` prefix:
  
  - `data-comments-root` → `data-nc-comments-root`
  - `data-comments-list` → `data-nc-comments-list`
  - `data-resource` → `data-nc-resource`
  - `data-comment-id` → `data-nc-comment-id`
  - `data-author-id` → `data-nc-author-id`
  - `data-deleted` → `data-nc-deleted`
  - `data-comment-footer` → `data-nc-comment-footer`
  - `data-comment-actions` → `data-nc-comment-actions`
  - `data-comment-reactions` → `data-nc-comment-reactions`
  - `data-reaction-type` → `data-nc-reaction-type`
  - `data-active` → `data-nc-active`
  - `data-comment-replies` → `data-nc-comment-replies`
  - `data-replies-list` → `data-nc-replies-list`
  - `data-reactions` → `data-nc-reactions`
  - `data-comment-composer` → `data-nc-comment-composer`
  - `data-comment-auth` → `data-nc-comment-auth`
  
  This is a breaking change for CSS selectors that target the old attribute names.
  The stable hooks are listed in `docs/components.md`.
- 4136e16: Expose classes for the reply list and its items.
  
  `CommentClasses` gains `repliesList` (the `<ol data-replies-list>`, e.g. for a
  border) and `replyItem` (each `<li>`, including the load-more item). Both are
  forwarded through `<Comments :comment-classes>` and to nested replies.

## 0.3.0

### Minor Changes

- 66508d9: Expose per-layer and per-button CSS classes on `<Comments>` and `<Comment>`.
  
  The reply/edit/delete buttons and the reactions now share one row
  (`data-comment-footer`), so they can be laid out together (e.g. `display: flex`).
  
  - `<Comment :classes>` accepts a `CommentClasses` object: `root`, `footer`,
    `actions`, `reactions`, `replies`, `replyButton`, `editButton`, `deleteButton`,
    `reactionButton`, `viewRepliesButton`, `loadMoreRepliesButton`.
  - `<Comments :comment-classes>` forwards a `CommentClasses` object to every
    comment (including nested replies).
  - `<Comments :classes>` accepts a `CommentsClasses` object: `root`, `list`,
    `loadMoreButton`.

### Patch Changes

- fe53a57: Show the `[deleted]` tombstone immediately after deleting a reply.
  
  `useComments` gains `patchDeleted(commentId)` and `<Comments>` calls it after a
  successful delete. Previously only top-level comments were refreshed, so a
  deleted reply kept rendering its old body until a full reload.

## 0.2.0

### Minor Changes

- 7f68808: Make every component string config-driven (i18n-ready).
  
  All built-in text — visible labels and `aria-label`s — can now be overridden
  through the `comments.messages` module option, merged over English defaults.
  Dynamic parts use `{token}` placeholders (e.g. `continueWith:
  'Continue with {provider}'`, `replyTo: 'Reply to {author}…'`). No i18n
  dependency is added; messages are plain strings in `runtimeConfig.public`.
  
  `useCommentsMessages()` is exposed as an auto-import so custom UI can read the
  configured strings (`t(key, params)`).
- dea7d50: Improve reply/edit UX, nested threads, and deletion consistency.
  
  - **Deletion is now always a soft-delete for the author.** Deleting a reply (or any
    comment) leaves a `[deleted]` tombstone so threads and the UI stay consistent.
    Admin `deleteCommentsUser` still hard-deletes leaves.
  - **`<Comments>` gains `expandReplies`** to eagerly load and expand every comment's
    reply thread instead of the "View replies" control.
  - **The `composer` slot now receives `replyingTo`, `editing`, and `cancel`** so
    consumers can render contextual reply/edit UI.
  - **`<CommentComposer>` gains `initialBody`**; the default composer prefills when
    editing and its placeholder reflects the edit/reply state.

### Patch Changes

- dea7d50: Fix `comments.auth.database.binding` during prerender.
  
  Prerender runs outside the Cloudflare runtime, so no D1 binding is present on
  `event.context.cloudflare.env`. The generated `createDatabase(event)` threw,
  failing every `/api/auth/get-session` request made while prerendering pages
  (the Better Auth server session plugin fetches it during SSR).
  
  It now returns `undefined` when `import.meta.prerender` is true, so Better Auth
  falls back to its in-memory adapter for the unauthenticated prerendered shell.
  At runtime a missing binding is still a hard error.
- 7f68808: Only show the reply-thread toggle when a comment has replies.
  
  The list endpoints now return `comment.replyCount`, so `<Comment>` renders the
  "View replies" control only for comments that actually have a thread (or whose
  thread is already loaded). `expandReplies` likewise skips comments without
  replies instead of fetching empty threads.

## 0.1.0

### Minor Changes

- 889bfff: Add opt-in D1-backed Better Auth persistence.
  
  Set `comments.auth.database.binding` to persist Better Auth users, sessions
  and accounts in Cloudflare D1 (email/password, OAuth, session revocation).
  The package registers a `better-auth:database:providers` provider that hands
  Better Auth the raw D1 binding; Better Auth builds its bundled Kysely D1
  adapter, so no extra dependency is required.
  
  The Better Auth tables ship in `migrations/auth/0001_better_auth.sql`.
  Without the option, behaviour is unchanged (Better Auth's in-memory default).
- fd99f29: Initial public release.

### Patch Changes

- 1fad93f: Fix published builds: import Better Auth helpers explicitly instead of relying on
  Nuxt/Nitro auto-imports, which are not applied to files resolved from
  `node_modules`.
  
  - `useCommentsSession` now imports `useUserSession` / `useAuthClient` from
    `@nuxtjs/better-auth/composables` and adapts to the real return types
    (`useAuthClient()` is nullable, `status` is derived from `ready` + `loggedIn`).
  - The server viewer resolves `getUserSession` from `#imports`.
  - Removes the hand-written ambient declarations that made the broken code
    typecheck in isolation (`src/runtime/better-auth.d.ts`).
