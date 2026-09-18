---
"@graficos/nuxt-comments": patch
---

Fix `comments.auth.database.binding` during prerender.

Prerender runs outside the Cloudflare runtime, so no D1 binding is present on
`event.context.cloudflare.env`. The generated `createDatabase(event)` threw,
failing every `/api/auth/get-session` request made while prerendering pages
(the Better Auth server session plugin fetches it during SSR).

It now returns `undefined` when `import.meta.prerender` is true, so Better Auth
falls back to its in-memory adapter for the unauthenticated prerendered shell.
At runtime a missing binding is still a hard error.