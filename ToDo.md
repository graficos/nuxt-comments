# ToDo

Backlog of follow-up work for `@graficos/nuxt-comments`.

## Make authentication pluggable (auth adapter seam)

**Status:** not started

**Why.** The module is hard-wired to `@nuxtjs/better-auth`. A consumer that
already has auth (Auth.js, Clerk, Lucia, Supabase, custom) cannot use it without
running Better Auth in parallel. The data model is already provider-agnostic —
`comments.userId` is an opaque id with no foreign key and no duplicated user
table — so only the runtime is coupled.

**Current couplings**

- `src/module.ts` — `moduleDependencies` force-installs and initializes
  `@nuxtjs/better-auth`.
- `src/runtime/server/services/auth.ts` — static `getUserSession` import from
  `#imports` (a Better Auth Nitro auto-import); absent the module, the build breaks.
- `src/runtime/app/composables/useCommentsSession.ts` — imports
  `useUserSession` / `useAuthClient` from `@nuxtjs/better-auth/composables`.

**Proposed**

- **Server:** add a `comments.auth.resolveViewer` option (a module specifier that
  exports `getViewer(event) => ViewerInfo | null`), defaulting to the Better Auth
  implementation. Mirrors the existing `CommentsStore` adapter seam.
- **Client:** make `useCommentsSession` consume an injected session source instead
  of importing Better Auth directly. The UI is already decoupled (components take a
  `#login` slot and a `providers` prop); only the composable's two imports block it.
- **Optionality:** skip the `@nuxtjs/better-auth` entry in `moduleDependencies`
  when a custom resolver is configured, so non-Better-Auth apps do not pull it in.
- Tests + docs.

**Acceptance**

- A consumer with custom auth can use the module without `@nuxtjs/better-auth`
  installed.
- Default behavior for Better Auth consumers is unchanged.
- The store/domain layer never imports auth types (already true; keep it true).
