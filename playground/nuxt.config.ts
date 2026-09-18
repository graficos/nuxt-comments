export default defineNuxtConfig({
  modules: [
    // The local module is loaded via the alias below; it declares
    // @nuxtjs/better-auth as a moduleDependencies entry, so Nuxt will
    // install it automatically.
    '../src/module',
    // Exposes Wrangler-defined bindings (D1) to the Nuxt dev server, so
    // `nuxt dev` uses the same local D1 as `wrangler dev`.
    'nitro-cloudflare-dev',
  ],

  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    },
  },

  compatibilityDate: '2025-01-01',

  nitro: {
    preset: 'cloudflare',
  },

  comments: {
    database: {
      binding: 'DB',
    },
    // Opt-in: persist Better Auth users/sessions in the same D1 database.
    // Requires the auth migrations in ../migrations/auth to be applied.
    auth: {
      database: {
        binding: 'DB',
      },
    },
    reactions: {
      enabled: true,
      types: ['like', 'heart', 'laugh'],
    },
    // Dogfood the unprefixed component API: <Comments>.
    components: {
      prefix: '',
    },
  },
})
