# Authentication

`@graficos/nuxt-comments` does **not** implement authentication. It consumes the session provided by [`@nuxtjs/better-auth`](https://better-auth.nuxt.dev). This keeps provider coverage open-ended — Google, GitHub, Apple, Discord, email/password, or any other provider Better Auth supports — with no provider-specific code in this package.

## How the dependency works

The module declares `@nuxtjs/better-auth` in two places:

1. **`peerDependencies`** — npm/pnpm/yarn auto-install peers, so the package resolves.
2. **Nuxt `moduleDependencies`** — Nuxt adds and initializes the Better Auth module automatically. You do **not** have to list `@nuxtjs/better-auth` in `modules` (doing so is harmless).

```ts
export default defineNuxtConfig({
  modules: ["nuxt-comments"], // @nuxtjs/better-auth is added via moduleDependencies
  comments: { database: { binding: "DB" } },
});
```

The module never overrides your Better Auth configuration. Better Auth remains the single source of truth for auth.

## Consumer configuration

Create the standard Better Auth files (the Better Auth module scaffolds them if missing):

```ts
// server/auth.config.ts
import { defineServerAuth } from "@nuxtjs/better-auth/config";

export default defineServerAuth({
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

```ts
// app/auth.config.ts
import { defineClientAuth } from "@nuxtjs/better-auth/config";

export default defineClientAuth({});
```

`.env`:

```bash
# Generate with: openssl rand -base64 32
NUXT_BETTER_AUTH_SECRET=<at least 32 random characters>
NUXT_PUBLIC_SITE_URL=http://localhost:3000   # required on Cloudflare Workers
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

OAuth callback URLs are Better Auth's concern, e.g. `https://your-site.com/api/auth/callback/github`. The comments package contains no OAuth credentials and no callback routes.

### Obtaining provider credentials

Both providers redirect back through Better Auth at `/api/auth/callback/<provider>`, so register that exact URL with the provider. Credentials are only needed for the providers you enable — email/password needs none.

**GitHub**

1. GitHub -> **Settings** -> **Developer settings** -> **OAuth Apps** -> **New OAuth App**.
2. Homepage URL: `http://localhost:3000`. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`.
3. Copy the **Client ID**, then **Generate a new client secret**.
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
5. For production, create a second OAuth app (or update the callback URL) with `https://your-site.com/api/auth/callback/github`.

**Google**

1. Google Cloud Console -> **APIs & Services** -> **OAuth consent screen**: configure an External app (test mode is fine for local dev) and add your account as a test user.
2. **APIs & Services** -> **Credentials** -> **Create credentials** -> **OAuth client ID** -> **Web application**.
3. Authorized JavaScript origins: `http://localhost:3000` (add your production origin later).
4. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`.
5. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## What the comments module uses

Server-side, the API reads the session via the `getUserSession(event)` Nitro helper:

```ts
// src/runtime/server/services/auth.ts (package internal)
const session = await getUserSession(event);
if (!session?.user) return null;
return {
  id: session.user.id,
  name: session.user.name ?? null,
  image: session.user.image ?? null,
};
```

Client-side, `useCommentsSession()` wraps Better Auth's `useUserSession()` and `useAuthClient()`:

```ts
const { user, status, loggedIn, ready, signIn, signOut } = useCommentsSession();
await signIn("github"); // provider name is consumer-owned
```

Reads are public. Creating, editing, deleting, replying and reacting all require an authenticated session.

## Identity model

- Comments are associated with the **Better Auth user id** (`comments.userId`). No `siteId`, no duplicate of Better Auth's user/session/account tables.
- **Email is not required** and is never used as an identity key.
- The author's **display name and avatar are snapshotted** onto the comment row at creation time (`authorName`, `authorImage`). This decouples reads from the auth backend and keeps the store backend-agnostic. When a user is deleted, these snapshots are nulled and the UI renders `[deleted author]`.
- One local user can link multiple providers over time — that is Better Auth's account model, which the comments schema does not duplicate.

## Login UI is yours

The package ships **no provider logos, assets, or brand-specific markup**. `CommentAuth` (or the `#login` slot on `<NuxtComments>`) exposes a generic sign-in action:

```vue
<Comments resource="/blog/my-post" :providers="['github', 'google']">
  <template #login="{ signIn, providers }">
    <div class="my-login">
      <p>Sign in to join the discussion</p>
      <button
        v-for="provider in providers"
        :key="provider"
        @click="signIn(provider)"
      >
        Continue with {{ provider }}
      </button>
    </div>
  </template>
</Comments>
```

The default rendering is intentionally text-only and unstyled. See [components.md](./components.md) for the full slot API.
