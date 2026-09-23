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

## Add end-to-end tests to the playground with Playwright

**Priority:** high (P1)

**Status:** done

**Why.** Unit, component, and API tests exercise handlers and composables in
isolation, but nothing runs the real browser flow against the playground app.
The recent SSR + client-reaction hydration work, optimistic posting, and the
erasure flow are exactly the kind of cross-boundary behavior only an e2e test
covers: SSR HTML → hydration → post → react → delete → erase.

**Proposed**

- Add Playwright to `playground/` with a config that boots the Nuxt dev/preview
  server and a dedicated D1 database.
- Seed/reset the database per run (reuse the existing seed helpers).
- Cover core workflows: SSR list renders with comments; reactions hydrate and
  toggle without a full reload; post a comment (optimistic + persisted);
  delete own comment; admin erases a user's data and the UI reflects it.
- Wire an `e2e` script and (optionally) a CI job.

**Acceptance**

- `pnpm --dir playground e2e` runs green locally against a fresh database.
- Tests fail if SSR content or reaction hydration regresses.

**Follow-up (not covered by the first pass):** the e2e suite exercises self-erasure
and the playground's token-gated admin route, but **not** the moderator branch of
`DELETE /api/_comments/users/:userId`. That branch (`isAdmin` in
`deleteUserData`, gated on `session.user.role === comments.auth.adminRole`) stays
untested because the playground does not enable Better Auth's admin plugin, so no
session ever carries a role. See the task below.

## Test the admin moderator erasure workflow end-to-end

**Priority:** medium (P2)

**Status:** not started

**Why.** The public erasure endpoint has two authority paths: self, and a
moderator whose server-session role matches `comments.auth.adminRole`
(`src/runtime/server/services/comments.service.ts`, `deleteUserData`). Only the
self path is covered by the Playwright suite. The moderator path — the one that
actually enforces "an admin can erase someone else's data, and a non-admin
cannot" — is untested.

**Proposed**

- Enable Better Auth's [admin plugin](https://www.better-auth.com/docs/plugins/admin)
  in `playground/server/auth.config.ts` (+ client plugin in `playground/app/auth.config.ts`).
- Add the plugin schema (`user.role`) to `migrations/auth/` and re-apply it in the
  playground e2e reset.
- Seed/promote an admin user in the e2e fixture (e.g. via the admin plugin's
  `create-admin` path or a direct role update).
- Add Playwright coverage: an admin session erases another user's data and gets
  `200`; a non-admin session targeting another user still gets `403`; the erased
  user's comments/reactions are gone or scrubbed in the UI.

**Acceptance**

- The moderator branch of `DELETE /api/_comments/users/:userId` is exercised in
  e2e for both the allowed (`200`) and denied (`403`) cases.
- The playground still runs read-only when no admin user exists.

## Add an OpenAPI JSON spec for the public HTTP API

**Priority:** medium (P2)

**Status:** not started

**Why.** The public HTTP API (`resource.get`, `replies.get`, `reactions.get`,
`users.delete`, plus mutations) is documented only in prose in
`docs/api.md`. Consumers and tooling want a machine-readable contract.

**Proposed**

- Emit `openapi.json` (OpenAPI 3.1) covering the namespaced `_comments` routes,
  with request/response schemas matching `src/runtime/shared/types.ts`.
- Prefer generating from the route table/type defs if cheap; otherwise hand-author
  and validate in CI so it cannot drift from the docs.
- Link the spec from `README.md` and `docs/api.md`.

**Acceptance**

- A valid `openapi.json` is shipped and referenced in the docs.
- Schemas match the actual handler payloads (validated in a test or CI check).
