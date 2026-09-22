---
"@graficos/nuxt-comments": patch
---

Hide actions and reactions on deleted comments, and reflect edits in place.

- A soft-deleted comment (or reply) no longer renders the action row, so its
  reaction buttons cannot be clicked. Reacting to a deleted comment previously
  failed server-side (`not_found`) and replaced the whole list with the error
  state. A deleted comment's reply-thread toggle still renders when it has replies.
- `useComments.updateComment` now patches the edited comment — top-level or a
  nested reply — in place, so an edit shows immediately without a refetch.
