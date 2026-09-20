# @graficos/nuxt-comments

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
