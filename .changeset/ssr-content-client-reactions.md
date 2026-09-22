---
"@graficos/nuxt-comments": minor
---

Server-render the comment list; hydrate reactions client-side.

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
