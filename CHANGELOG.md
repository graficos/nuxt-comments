# @graficos/nuxt-comments

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
