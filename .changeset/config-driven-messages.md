---
"@graficos/nuxt-comments": minor
---

Make every component string config-driven (i18n-ready).

All built-in text — visible labels and `aria-label`s — can now be overridden
through the `comments.messages` module option, merged over English defaults.
Dynamic parts use `{token}` placeholders (e.g. `continueWith:
'Continue with {provider}'`, `replyTo: 'Reply to {author}…'`). No i18n
dependency is added; messages are plain strings in `runtimeConfig.public`.

`useCommentsMessages()` is exposed as an auto-import so custom UI can read the
configured strings (`t(key, params)`).
