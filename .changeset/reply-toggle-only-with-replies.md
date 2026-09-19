---
"@graficos/nuxt-comments": patch
---

Only show the reply-thread toggle when a comment has replies.

The list endpoints now return `comment.replyCount`, so `<Comment>` renders the
"View replies" control only for comments that actually have a thread (or whose
thread is already loaded). `expandReplies` likewise skips comments without
replies instead of fetching empty threads.
