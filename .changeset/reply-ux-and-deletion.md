---
"@graficos/nuxt-comments": minor
---

Improve reply/edit UX, nested threads, and deletion consistency.

- **Deletion is now always a soft-delete for the author.** Deleting a reply (or any
  comment) leaves a `[deleted]` tombstone so threads and the UI stay consistent.
  Admin `deleteCommentsUser` still hard-deletes leaves.
- **`<Comments>` gains `expandReplies`** to eagerly load and expand every comment's
  reply thread instead of the "View replies" control.
- **The `composer` slot now receives `replyingTo`, `editing`, and `cancel`** so
  consumers can render contextual reply/edit UI.
- **`<CommentComposer>` gains `initialBody`**; the default composer prefills when
  editing and its placeholder reflects the edit/reply state.