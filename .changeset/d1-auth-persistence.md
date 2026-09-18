---
"@graficos/nuxt-comments": minor
---

Add opt-in D1-backed Better Auth persistence.

Set `comments.auth.database.binding` to persist Better Auth users, sessions
and accounts in Cloudflare D1 (email/password, OAuth, session revocation).
The package registers a `better-auth:database:providers` provider that hands
Better Auth the raw D1 binding; Better Auth builds its bundled Kysely D1
adapter, so no extra dependency is required.

The Better Auth tables ship in `migrations/auth/0001_better_auth.sql`.
Without the option, behaviour is unchanged (Better Auth's in-memory default).
