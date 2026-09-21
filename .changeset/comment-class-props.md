---
"@graficos/nuxt-comments": minor
---

Expose per-layer and per-button CSS classes on `<Comments>` and `<Comment>`.

The reply/edit/delete buttons and the reactions now share one row
(`data-comment-footer`), so they can be laid out together (e.g. `display: flex`).

- `<Comment :classes>` accepts a `CommentClasses` object: `root`, `footer`,
  `actions`, `reactions`, `replies`, `replyButton`, `editButton`, `deleteButton`,
  `reactionButton`, `viewRepliesButton`, `loadMoreRepliesButton`.
- `<Comments :comment-classes>` forwards a `CommentClasses` object to every
  comment (including nested replies).
- `<Comments :classes>` accepts a `CommentsClasses` object: `root`, `list`,
  `loadMoreButton`.
