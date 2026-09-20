---
"@graficos/nuxt-comments": patch
---

Show the `[deleted]` tombstone immediately after deleting a reply.

`useComments` gains `patchDeleted(commentId)` and `<Comments>` calls it after a
successful delete. Previously only top-level comments were refreshed, so a
deleted reply kept rendering its old body until a full reload.
