---
"@graficos/nuxt-comments": patch
---

Fix published builds: import Better Auth helpers explicitly instead of relying on
Nuxt/Nitro auto-imports, which are not applied to files resolved from
`node_modules`.

- `useCommentsSession` now imports `useUserSession` / `useAuthClient` from
  `@nuxtjs/better-auth/composables` and adapts to the real return types
  (`useAuthClient()` is nullable, `status` is derived from `ready` + `loggedIn`).
- The server viewer resolves `getUserSession` from `#imports`.
- Removes the hand-written ambient declarations that made the broken code
  typecheck in isolation (`src/runtime/better-auth.d.ts`).