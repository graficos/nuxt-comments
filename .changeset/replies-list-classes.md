---
"@graficos/nuxt-comments": minor
---

Expose classes for the reply list and its items.

`CommentClasses` gains `repliesList` (the `<ol data-replies-list>`, e.g. for a
border) and `replyItem` (each `<li>`, including the load-more item). Both are
forwarded through `<Comments :comment-classes>` and to nested replies.
