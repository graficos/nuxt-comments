---
"@graficos/nuxt-comments": patch
---

Fix two reaction-hydration bugs surfaced by the new playground e2e suite:

- The initial-page watcher (`immediate` + `flush: 'sync'`) called
  `scheduleReactionHydration` during setup, before the hydration batching state
  was initialized — a temporal-dead-zone crash on any page that rendered
  comments with reactions enabled.
- A reaction-hydration response already in flight when the viewer toggled a
  reaction could overwrite the optimistic update. Locally mutated comments are
  now skipped when hydration summaries are merged.
