---
"@graficos/nuxt-comments": patch
---

Treat the idle `useAsyncData` state as loading.

On a prerendered page the server skips the initial fetch
(`server: !import.meta.prerender`), so the async-data status stays `idle`.
`useComments`' `loading` now includes `idle`, so `<Comments>` renders its
loading state in the prerendered HTML instead of the empty state (and stays
consistent through hydration). Consumers can drop `<ClientOnly>`.
