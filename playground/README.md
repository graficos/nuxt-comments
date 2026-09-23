# @graficos/nuxt-comments playground

A small Nuxt 4 app that exercises the local `@graficos/nuxt-comments` module. It is the canonical integration environment: the module is loaded from `../src/module`, D1 bindings come from Miniflare, and authentication runs through Better Auth.

The playground owns its **styling** and its **login UI** — the package ships neither.

## What it demonstrates

- `<Comments resource="...">` (the playground sets `components.prefix: ''`)
- Reactive/threaded replies, lazy reply loading
- Configurable reactions (`like`, `heart`, `laugh`)
- Custom slots and playground-owned CSS
- A gated route demonstrating the server-only `deleteCommentsUser` admin utility

## Run it

From the repository root:

```bash
pnpm install
pnpm dev:prepare             # stub-build the module + prepare the playground
pnpm playground:migrate      # apply the comments migrations to local D1
pnpm playground:migrate:auth # apply the Better Auth tables to local D1
pnpm dev                     # http://localhost:3000
```

- `/` links to sample posts
- `/blog/memorylessness` renders the comments UI
- `/admin` demonstrates user deletion

## D1 in development

The playground uses [`nitro-cloudflare-dev`](https://github.com/pi0/nitro-cloudflare-dev) (declared in `playground/nuxt.config.ts`) to expose Wrangler-defined bindings to `nuxt dev`. The binding is defined in `playground/wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "playground-comments",
      "database_id": "local-playground-comments",
      "migrations_dir": "../migrations",
    },
  ],
}
```

Local D1 state persists in `playground/.wrangler/state`. `pnpm run playground:migrate` applies the comments migrations locally; `pnpm run playground:migrate:auth` applies the Better Auth tables from `migrations/auth/` using `playground/wrangler.auth.jsonc`.

The module options match the binding:

```ts
comments: {
  database: {
    binding: "DB";
  }
  // opt-in D1-backed Better Auth
  auth: {
    database: {
      binding: "DB";
    }
  }
}
```

## Authentication

The playground opts into **D1-backed Better Auth** (`comments.auth.database.binding: "DB"`), so **email/password works out of the box** once `pnpm playground:migrate:auth` has run:

```bash
# create a user
curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"password12345","name":"Me"}'

# create a comment with the session cookie
curl -b cookies.txt -X POST http://localhost:3000/api/_comments/blog/memorylessness \
  -H 'content-type: application/json' \
  -d '{"body":"Hello from the playground"}'
```

### Optional OAuth providers

Copy `.env.example` to `.env`, set the Better Auth secret, and (optionally) provider credentials:

```bash
cp playground/.env.example playground/.env
```

```bash
NUXT_BETTER_AUTH_SECRET=<32+ random characters>
NUXT_PUBLIC_SITE_URL=http://localhost:3000

# optional
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Providers are configured in `playground/server/auth.config.ts`. Callback URLs follow Better Auth's convention:

- GitHub: `http://localhost:3000/api/auth/callback/github`
- Google: `http://localhost:3000/api/auth/callback/google`

Register those callback URLs when you create the OAuth app/credentials. Step-by-step instructions for both providers are in [../docs/authentication.md#obtaining-provider-credentials](../docs/authentication.md#obtaining-provider-credentials).

The playground's login buttons are text-only and live in the page/slot markup — **the package ships no provider logos or assets**, by design.

## User deletion demo

The package ships **no admin HTTP endpoint**. `playground/server/api/admin/delete-user.post.ts` demonstrates the intended wiring: it performs its own authorization (a shared token) and calls the server-only utility:

```ts
import { deleteCommentsUser } from "#comments/server";

const result = await deleteCommentsUser(event, userId);
// { comments: number, reactions: number }
```

Set `PLAYGROUND_ADMIN_TOKEN` in `.env` and paste the same value on the `/admin` page. The deletion semantics are documented in [../docs/api.md](../docs/api.md#deletion-policy).

## End-to-end tests

Browser tests live in `playground/e2e/` and run against a real `nuxt dev`
instance (Playwright starts it for you). They cover the cross-boundary flows
unit/component/API tests cannot: SSR HTML → hydration → post → reply → react →
delete → erase.

### Run it

From the repository root:

```bash
pnpm install
pnpm run dev:prepare                                   # stub-build the module
pnpm --dir playground exec playwright install chromium # one-time browser download
pnpm --dir playground e2e
```

Useful variants:

```bash
pnpm --dir playground e2e:ui       # interactive Playwright UI
pnpm --dir playground e2e:headed   # watch the browser
pnpm --dir playground e2e -- ssr-and-auth.spec.ts   # a single spec
```

### How it works

- **Fresh database per run.** `e2e:serve` wipes `playground/.wrangler/state`,
  re-applies the comments and Better Auth migrations, then boots `nuxt dev` on
  **port 3100** (so it never clashes with a running `pnpm dev`). Playwright never
  reuses an existing server, so every run starts clean.
- **Isolation between tests.** There are no shared seeds: each test signs up its
  own Better Auth user through `POST /api/auth/sign-up/email` and works on a
  unique resource id (`/blog/e2e-<random>`), so specs are independent and can run
  in parallel.
- **Auth without the UI.** The login slot is OAuth-only, which cannot be driven
  headlessly, so the fixtures create a real session via the sign-up API and
  inject the cookie into the browser context.
- **Rate limiting.** The in-memory limiter would throttle a parallel suite, so
  `playground/nuxt.config.ts` disables it outside production builds
  (`process.env.CI || process.env.NODE_ENV !== 'production'`).

### What's covered

| Spec | Flows |
| --- | --- |
| `ssr-and-auth` | SSR renders comments; reactions hydrate client-side without a reload; unauthenticated gating |
| `comment-lifecycle` | post + persist; edit; delete (tombstone); post again; plain-text/XSS safety |
| `replies` | add reply; lazy "View replies"; delete reply; delete parent, preserve reply |
| `reactions` | add/remove; persistence across reload; multi-user counts |
| `privacy` | self-erasure scrubs PII and keeps threads; `401`/`403`; the token-gated `/admin` route |
| `pagination` | "Load more" |

> The moderator branch of `DELETE /api/_comments/users/:userId` (admin role) is
> not covered yet — see the follow-up in [../ToDo.md](../ToDo.md).

## Styling

The package is unstyled. All visual presentation for the playground lives in `playground/app/pages/*.vue` (scoped CSS and slot markup). This is deliberate — it demonstrates that a consumer can completely redesign layout, typography, buttons and reaction UI without forking the package.
