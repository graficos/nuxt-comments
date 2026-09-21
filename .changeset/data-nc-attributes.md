---
"@graficos/nuxt-comments": minor
---

Namespace all component data attributes under `data-nc-*`.

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
