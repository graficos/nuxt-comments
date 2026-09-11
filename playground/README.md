# nuxt-comments playground

A small Nuxt 4 app that exercises the local `nuxt-comments` module. It is the canonical integration environment: the module is loaded from `../src/module`, D1 bindings come from Miniflare, and authentication runs through Better Auth.

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
pnpm dev:prepare        # stub-build the module + prepare the playground
pnpm playground:migrate # apply the package migrations to local D1
pnpm dev                # http://localhost:3000
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

Local D1 state persists in `playground/.wrangler/state`. `pnpm run playground:migrate` applies the package migrations locally.

The module option matches the binding:

```ts
comments: {
  database: {
    binding: "DB";
  }
}
```

## Authentication

The default setup supports **email/password** out of the box, so you can develop and test authenticated mutations without any OAuth credentials:

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

Providers are configured in `playground/server/auth.config.ts`. Callback URLs follow Better Auth's convention, e.g. `http://localhost:3000/api/auth/callback/github`.

The playground's login buttons are text-only and live in the page/slot markup — **the package ships no provider logos or assets**, by design.

## User deletion demo

The package ships **no admin HTTP endpoint**. `playground/server/api/admin/delete-user.post.ts` demonstrates the intended wiring: it performs its own authorization (a shared token) and calls the server-only utility:

```ts
import { deleteCommentsUser } from "#comments/server";

const result = await deleteCommentsUser(event, userId);
// { comments: number, reactions: number }
```

Set `PLAYGROUND_ADMIN_TOKEN` in `.env` and paste the same value on the `/admin` page. The deletion semantics are documented in [../docs/api.md](../docs/api.md#deletion-policy).

## Styling

The package is unstyled. All visual presentation for the playground lives in `playground/app/pages/*.vue` (scoped CSS and slot markup). This is deliberate — it demonstrates that a consumer can completely redesign layout, typography, buttons and reaction UI without forking the package.
