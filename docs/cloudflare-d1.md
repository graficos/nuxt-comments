# Cloudflare & D1

The MVP persistence backend is **Cloudflare D1**. `@graficos/nuxt-comments` only needs the **binding name** — it never provisions infrastructure, creates databases, or assumes a binding called `DB`.

## 1. Create a D1 database

```bash
npx wrangler d1 create my-comments
```

Wrangler prints the binding snippet and offers to add it to your Wrangler file. You can also create the database from the Cloudflare dashboard: **Workers & Pages → D1 SQL database → Create**.

## 2. Bind it in your Wrangler configuration

JSONC (`wrangler.jsonc` / `wrangler.json`):

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-comments",
      "database_id": "<database-uuid>",
      "preview_database_id": "<optional-preview-uuid>",
    },
  ],
}
```

TOML (`wrangler.toml`):

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-comments"
database_id = "<database-uuid>"
preview_database_id = "<optional-preview-uuid>"
```

The **binding name** (`DB`) is what your Worker sees as `env.DB`. Set the same name in the module:

```ts
export default defineNuxtConfig({
  comments: {
    database: {
      binding: "DB", // must match the `binding` value in your Wrangler file
    },
  },
});
```

At runtime the module reads the binding from `event.context.cloudflare.env[comments.database.binding]`. If it is missing, the API returns a 500 with a clear server-side error message.

> You may also override the binding name at runtime with `NUXT_COMMENTS_DATABASE_BINDING`.

## 3. Migrations

The package ships SQL migrations in `migrations/` (inside the published package: `node_modules/nuxt-comments/migrations/`):

```text
0001_init.sql               # comments tables
0002_user_id_nullable.sql   # makes comments.user_id nullable (user erasure)
auth/0001_better_auth.sql   # Better Auth tables (only if comments.auth.database.binding is set)
```

**The package never runs migrations during Nuxt startup.** Applying migrations modifies your database and must be treated as a deployment operation, just like any other D1 migration.

> **Auth tables.** `migrations/auth/` is a separate migration set for the [opt-in D1 Better Auth provider](./authentication.md#turnkey-d1-persistence-opt-in). Wrangler's `migrations_dir` is not recursive, so apply it with its own Wrangler config (or copy `migrations/auth/*` into a dedicated folder) and run `wrangler d1 migrations apply` again. It may target the same database as the comments.

### Recommended workflow: copy migrations into your app

Keep the package's numbered files alongside your own migrations:

```bash
cp -r node_modules/nuxt-comments/migrations/* ./migrations/
```

Then use the normal Wrangler D1 migration workflow:

```bash
# local development database
npx wrangler d1 migrations apply my-comments --local

# preview database (if configured)
npx wrangler d1 migrations apply my-comments --preview

# production database
npx wrangler d1 migrations apply my-comments --remote
```

Wrangler records applied migrations in the `d1_migrations` table and only runs each file once.

### Alternative: point `migrations_dir` at the package

If you prefer not to copy files, set `migrations_dir` on the D1 binding in a Wrangler config dedicated to comments migrations:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-comments",
      "database_id": "<database-uuid>",
      "migrations_dir": "node_modules/nuxt-comments/migrations",
    },
  ],
}
```

`migrations_dir` is a Wrangler **config** option — there is no `--migrations-dir` CLI flag.

### Package upgrades

- Each package release that changes the schema adds a new numbered file, e.g. `0002_user_id_nullable.sql`.
- Copy the new files (or re-point `migrations_dir`) and re-run `wrangler d1 migrations apply`. Already-applied migrations are skipped.
- `0002_user_id_nullable.sql` rebuilds nothing: it adds a temporary column, copies `user_id`, drops the old column and renames the new one (`ALTER TABLE ... DROP/RENAME COLUMN`). This is deliberate — a `DROP TABLE` rebuild would cascade-delete `comment_reactions` and trip the self-referential `parent_id` foreign key, since D1 always enforces foreign keys and cannot disable them inside a migration.
- Always review the new SQL before applying it to production. Migrations are additive; the package does not rewrite history.

## 4. Local development

You have two options.

### Option A — `nuxt dev` with `nitro-cloudflare-dev`

Add [`nitro-cloudflare-dev`](https://github.com/pi0/nitro-cloudflare-dev) to your app so Nuxt's dev server gets the Wrangler-defined D1 binding:

```ts
export default defineNuxtConfig({
  modules: ["nitro-cloudflare-dev", "nuxt-comments"],
});
```

Apply migrations locally first, then `nuxt dev`:

```bash
npx wrangler d1 migrations apply my-comments --local
nuxt dev
```

Local D1 state lives in the project's `.wrangler/state` directory.

### Option B — build and run with `wrangler dev`

```bash
nuxt build
npx wrangler dev
```

This runs the built Worker with the real Wrangler binding resolution.

## 5. Deployment

Deploy however you deploy Nuxt on Cloudflare (Workers via the auto-detected `cloudflare` preset, Cloudflare Pages, or `wrangler deploy`). Two things must be true in production:

1. The D1 binding is present on the deployed Worker (Wrangler file or dashboard binding).
2. The migrations have been applied to the **remote** database:

   ```bash
   npx wrangler d1 migrations apply my-comments --remote
   ```

Preview and production are separate databases. `--local` never touches remote; `--remote` never touches your machine. Set `NUXT_PUBLIC_SITE_URL` on the deployed Worker (Better Auth needs it — Cloudflare Workers does not provide one automatically).

## 6. Binding name vs database name

- **Binding name** (`DB`) is local to your Worker configuration and is what `comments.database.binding` must match.
- **Database name** (`my-comments`) is the Cloudflare resource name.
- The binding name can change; the database name cannot. Cloudflare's own guidance is to use the database name when running migrations to avoid applying to the wrong binding.

## Local development notes

- `nuxt dev` without a binding will return HTTP 500 for comment reads because there is no `event.context.cloudflare` context. Add `nitro-cloudflare-dev` or run via `wrangler dev`.
- Public reads require no authentication, so you can develop the read UI without OAuth credentials.
- For authenticated mutations in development you need a working Better Auth session. Email/password requires persistent storage and is **unavailable in database-less mode**; configure a Better Auth database or an OAuth provider. See [authentication.md#persistence](./authentication.md#persistence).
