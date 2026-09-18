# @graficos/nuxt-comments

An embeddable, **unstyled** comments system for **Nuxt 4**, backed by **Cloudflare D1** and authenticated through the host application's **Better Auth** setup.

`@graficos/nuxt-comments` is a reusable Nuxt module — not a hosted widget. It ships the threaded comments primitive (data model, API, composables, unstyled components) and leaves identity to [`@nuxtjs/better-auth`](https://better-auth.nuxt.dev) and presentation to you.

## Features

- 🧶 Threaded comments (adjacency list, arbitrary nesting via `parentId`)
- 📖Cursor-based pagination for top-level comments and replies
- 😊 Reactions with configurable types and database-enforced uniqueness
- 🔑 Server-side ownership checks (edit/delete your own comments only)
- 🕳️ Soft deletion that preserves threads (`[deleted]` placeholders)
- 🚫 Admin user deletion (`deleteCommentsUser`) with documented semantics
- 💪🏽 Shared validation, consistent HTTP error envelope (thanks to Valibot)
- ⏱️ Rate-limiter extension point (Cloudflare-native integration documented)
- 🎨 Unstyled, accessible components with typed slots
- 🔄 Adapter boundary for alternative persistence backends (potentially future feature)

## Why

- **Nuxt-native.** Server routes, composables and components are registered by the module. No external comment service, no embed script, no analytics.
- **Auth is borrowed, not rebuilt.** The package consumes the Better Auth session. Any provider Better Auth supports works without provider-specific code.
- **Unstyled by design.** Semantic HTML, accessibility attributes, props/slots/events. You own the CSS, the layout, the auth buttons, the emoji.
- **Backend-abstracted.** The domain talks to a `CommentsStore` interface; D1 is the only shipped implementation. A future GitHub Discussions mirror can be added behind the same boundary.
- **One database per site.** No tenant column, no cross-site data. Each Nuxt installation gets its own D1 binding.
- **Resource-scoped.** Comments belong to an opaque resource identifier (usually a blog post path).

## Architecture

```text
Better Auth  ──►  session (who is the current user?)
                        │
Vue/Nuxt UI  ──►  Comments API (/api/_comments/...)  ──►  CommentsService
  (unstyled)                                                    │
                                                        CommentsStore (interface)
                                                                │
                                                        D1CommentsStore  ──►  D1
```

- Server route handlers are thin: parse → session → service → store.
- `CommentsService` owns validation, authorization, ownership and deletion policy.
- `D1CommentsStore` owns SQL. The domain never imports D1 types.
- See [docs/adapters.md](./docs/adapters.md) for the future GitHub Discussions architecture (not implemented).

## Requirements

- Nuxt `>= 4.0.0`
- [`@nuxtjs/better-auth`](https://better-auth.nuxt.dev) (installed automatically as a peer + module dependency in npm/pnpm; see [docs/authentication.md](./docs/authentication.md))
- A Cloudflare D1 database and a Wrangler binding **for comments** (see [docs/cloudflare-d1.md](./docs/cloudflare-d1.md))
- A **Better Auth database** for durable identities — or accept the [no-persistence fallback](./docs/authentication.md#persistence) (OAuth-only, no email/password, no server-side session revocation). Cloudflare D1 can host both the auth tables and the comments.
- `wrangler` available to run migrations

## Install

```bash
pnpm add @graficos/nuxt-comments
```

`@nuxtjs/better-auth` is declared as both a peer dependency and a Nuxt `moduleDependencies` entry. npm/pnpm/yarn auto-install peer dependencies; if your package manager does not, install it explicitly:

```bash
pnpm add @nuxtjs/better-auth
```

## Minimal setup

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    // @nuxtjs/better-auth is auto-installed via moduleDependencies —
    // you do not need to list it here (listing it is harmless).
    "nuxt-comments",
  ],

  comments: {
    database: {
      binding: "DB", // Same as the Wrangler binding name for your D1 database for the comments
    },
  },
});
```

`wrangler.jsonc` (or `wrangler.toml`) — the binding name must match `comments.database.binding`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-comments",
      "database_id": "<your-database-id>",
    },
  ],
}
```

Better Auth configuration files (`server/auth.config.ts` and `app/auth.config.ts`) are created by the Better Auth module. Add providers there:

```ts
// server/auth.config.ts
import { defineServerAuth } from "@nuxtjs/better-auth/config";

export default defineServerAuth({
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

`.env`:

```bash
NUXT_BETTER_AUTH_SECRET=<at least 32 random chars>
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

> **Auth persistence.** `@nuxtjs/better-auth` only auto-configures a database when NuxtHub is installed. Without it, it falls back to Better Auth's **in-memory adapter** (users and sessions do not survive the current isolate): **email/password is unavailable**, and sessions cannot be revoked server-side. The comments package only reads the session, so it works either way — but for durable identities, point Better Auth at a database in `server/auth.config.ts`. Cloudflare D1 can host both the auth tables and the comments. See [docs/authentication.md#persistence](./docs/authentication.md#persistence).

Run the package migrations against your local D1. Either copy the shipped SQL into your own `migrations/` folder, or point a Wrangler config's `migrations_dir` at the package:

```bash
# recommended: copy the package migrations into your app's migrations/ dir
cp -r node_modules/@graficos/nuxt-comments/migrations/* ./migrations/

# apply locally, then remotely when deploying
npx wrangler d1 migrations apply my-comments --local
npx wrangler d1 migrations apply my-comments --remote
```

Then use the component:

```vue
<template>
  <Comments resource="/blog/my-post" />
</template>
```

> **Component prefix.** Nuxt best practice is to prefix module exports, so the default `components.prefix` is `'Nuxt'` and the components are `<NuxtComments>`, `<NuxtComment>`, etc. Set `components.prefix: ''` to get the unprefixed `<Comments>` shown above. See [docs/configuration.md](./docs/configuration.md).

## Documentation

| Document                                   | Contents                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [Configuration](./docs/configuration.md)   | Module options, runtime config, env vars, pagination, reactions, limits, resource identifiers |
| [Authentication](./docs/authentication.md) | Better Auth integration, providers, email-optional identity, consumer-owned login UI          |
| [Cloudflare & D1](./docs/cloudflare-d1.md) | Database creation, Wrangler binding, local development, migrations, production                |
| [Components](./docs/components.md)         | `<NuxtComments>` props/slots/events, composables, types, styling strategy                     |
| [Server API](./docs/api.md)                | Endpoints, validation, errors, pagination, deletion policy                                    |
| [Adapters](./docs/adapters.md)             | `CommentsStore` boundary, D1 adapter, future GitHub Discussions architecture                  |
| [Playground](./playground/README.md)       | Running the demo app locally, OAuth setup                                                     |

## Development

```bash
pnpm install
pnpm run dev:prepare      # stub-build the module + prepare the playground
pnpm run playground:migrate
pnpm run dev              # http://localhost:3000
```

Quality gates:

```bash
pnpm run lint
pnpm run test             # workers-runtime + node/nuxt test suites (101 tests)
pnpm run test:types
pnpm run prepack          # production build of the published package
```

See [playground/README.md](./playground/README.md) for OAuth setup and the admin deletion demo.

## Package structure

```text
src/
  module.ts                         # defineNuxtModule: meta, moduleDependencies, registration
  types.ts                          # module option types + runtime config augmentation
  runtime/
    app/components/                 # unstyled Vue components
    app/composables/                # useComments, useCommentsSession
    shared/                         # types, resources, Valibot schemas (server + client)
    server/
      api/_comments/                # Nitro route handlers (thin)
      services/                     # CommentsService, admin deletion, session helpers
      repositories/                 # CommentsStore interface + D1CommentsStore
      utils/                        # store resolution, errors, HTTP mapping, rate limiting
migrations/
  0001_init.sql                     # shipped SQL migrations
playground/                         # Nuxt 4 app exercising the module
test/
  unit/                             # domain + service + resource tests
  api/                              # API handlers on real Miniflare D1
  nuxt/                             # component tests in a Nuxt environment
  module/                           # module registration/config tests
```

## License

MIT
