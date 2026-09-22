/// <reference types="@nuxtjs/better-auth" />

import { defu } from 'defu'
import { defineNuxtModule, addComponent, addImports, addServerHandler, createResolver } from '@nuxt/kit'
import type { ModuleOptions } from './types'
import { defaultCommentsMessages } from './runtime/shared/messages'

export type { ModuleOptions } from './types'

/**
 * Generate the `#auth/database` module source for the opt-in D1 provider.
 *
 * `createDatabase(event)` returns the raw D1 binding. `@nuxtjs/better-auth`
 * passes it to Better Auth, which detects the D1 API (`batch`/`exec`/`prepare`)
 * and builds Kysely with its bundled `D1SqliteDialect` — so no adapter
 * dependency is required.
 *
 * During prerender there is no Cloudflare runtime, so the binding is absent.
 * Return `undefined` there and let Better Auth fall back to its in-memory
 * adapter (prerendered HTML is the unauthenticated shell only); at runtime a
 * missing binding is still a hard error.
 */
export function buildD1DatabaseCode(binding: string): string {
  const name = JSON.stringify(binding)
  return `export function createDatabase(event) {
  const bindingName = ${name}
  const env = event && event.context && event.context.cloudflare && event.context.cloudflare.env
  const db = env && env[bindingName]
  if (!db) {
    if (import.meta.prerender) return undefined
    throw new Error(\`[nuxt-comments] Better Auth D1 binding "\${bindingName}" not found on event.context.cloudflare.env. Set comments.auth.database.binding to a configured D1 binding and ensure the cloudflare nitro preset is active.\`)
  }
  return db
}
export const db = undefined
`
}

const defaults: ModuleOptions = {
  database: {
    binding: 'DB',
  },
  pagination: {
    pageSize: 20,
    maxPageSize: 100,
  },
  reactions: {
    enabled: true,
    // NOTE: `types` deliberately has no default here. `defu` (used by
    // `defineNuxtModule` to merge `defaults` with user options) concatenates
    // arrays, which would duplicate entries. The `['like']` fallback is
    // applied in `setup` instead.
    //
    // types: ['like'],
  },
  limits: {
    maxBodyLength: 4000,
    maxResourceLength: 512,
  },
  components: {
    prefix: 'Nuxt',
  },
  messages: defaultCommentsMessages,
  rateLimiter: 'memory',
}

const resolver = createResolver(import.meta.url)

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-comments',
    configKey: 'comments',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults,
  moduleDependencies: {
    '@nuxtjs/better-auth': {
      version: '>=0.3.0 <1.0.0',
    },
  },
  setup(options, nuxt) {
    const prefix = options.components?.prefix ?? 'Nuxt'
    const componentPrefix = prefix

    // `types` has no entry in `defaults` (defu concatenates arrays), so the
    // fallback is applied here. User-provided types pass through untouched.
    const reactionTypes = options.reactions?.types ?? ['like']

    // Opt-in D1-backed Better Auth. `@nuxtjs/better-auth` calls this hook
    // during `modules:done`, after every module's setup, so registering here
    // is in time. NuxtHub's provider (priority 100) still wins when present.
    nuxt.hook('better-auth:database:providers', (providers) => {
      const authBinding = options.auth?.database?.binding
      if (!authBinding) return
      providers['comments-d1'] = {
        priority: 50,
        isEnabled: ({ hasHubDbAvailable, clientOnly }) => !hasHubDbAvailable && !clientOnly,
        buildDatabaseCode: () => buildD1DatabaseCode(authBinding),
      }
    })

    // Merge options into runtimeConfig (server-only + public).
    nuxt.options.runtimeConfig.comments = defu(
      nuxt.options.runtimeConfig.comments,
      {
        databaseBinding: options.database?.binding ?? 'DB',
        rateLimiter: options.rateLimiter ?? 'memory',
        rateLimiterTrustProxy: options.rateLimiterTrustProxy ?? false,
      },
    ) as NonNullable<typeof nuxt.options.runtimeConfig.comments>

    nuxt.options.runtimeConfig.public.comments = defu(
      nuxt.options.runtimeConfig.public.comments as Record<string, unknown> | undefined,
      {
        pagination: options.pagination,
        reactions: { ...options.reactions, types: reactionTypes },
        limits: options.limits,
        componentsPrefix: componentPrefix,
        messages: options.messages,
      },
    ) as NonNullable<typeof nuxt.options.runtimeConfig.public.comments>

    // Components (prefix-aware; default 'Nuxt'). Consumer sets prefix '' for <Comments>.
    const components = [
      { file: 'Comments', name: 'Comments' },
      { file: 'Comment', name: 'Comment' },
      { file: 'CommentComposer', name: 'CommentComposer' },
      { file: 'CommentReactions', name: 'CommentReactions' },
      { file: 'CommentAuth', name: 'CommentAuth' },
    ]
    for (const c of components) {
      addComponent({
        name: componentPrefix ? `${componentPrefix}${c.name}` : c.name,
        filePath: resolver.resolve(`./runtime/app/components/${c.file}.vue`),
      })
    }

    // Composables.
    addImports([
      { name: 'useComments', from: resolver.resolve('./runtime/app/composables/useComments') },
      { name: 'useCommentsSession', from: resolver.resolve('./runtime/app/composables/useCommentsSession') },
      { name: 'useCommentsMessages', from: resolver.resolve('./runtime/app/composables/useCommentsMessages') },
    ])

    // Server API handlers.
    //
    // Resource ids are opaque and may contain slashes, so they use a
    // catch-all. Comment-scoped operations live under the reserved
    // `threads/` prefix — this avoids ambiguity with multi-segment
    // resources (e.g. resource `blog/reactions` must not be parsed as a
    // reaction on comment `blog`). See the README's API design note.
    //
    // The HTTP method is derived (and uppercased) by `addServerHandler`
    // from the handler filename suffix (`.get.ts`, `.post.ts`, ...).
    const apiBase = '/api/_comments'
    const handlerFiles = [
      'resource.get',
      'resource.post',
      'comment.patch',
      'comment.delete',
      'replies.get',
      'replies.post',
      'reactions.get',
      'reactions.post',
      'reactions-type.delete',
    ]
    const routes: Record<string, string> = {
      'resource.get': `${apiBase}/**:resource`,
      'resource.post': `${apiBase}/**:resource`,
      'comment.patch': `${apiBase}/threads/:commentId`,
      'comment.delete': `${apiBase}/threads/:commentId`,
      'replies.get': `${apiBase}/threads/:commentId/replies`,
      'replies.post': `${apiBase}/threads/:commentId/replies`,
      'reactions.get': `${apiBase}/threads/reactions`,
      'reactions.post': `${apiBase}/threads/:commentId/reactions`,
      'reactions-type.delete': `${apiBase}/threads/:commentId/reactions/:type`,
    }
    for (const file of handlerFiles) {
      addServerHandler({
        route: routes[file]!,
        // No extension: resolves to `.ts` in dev (source) and `.js` in the
        // published `dist` build. The HTTP method is derived from the
        // filename suffix (`.get`, `.post`, ...).
        handler: resolver.resolve(`./runtime/server/api/_comments/${file}`),
      })
    }

    // Server utility alias for the admin service. The explicit `index`
    // keeps the alias resolvable both from the module source and the
    // published `dist` output.
    nuxt.options.nitro.alias = nuxt.options.nitro.alias || {}
    nuxt.options.nitro.alias['#comments/server'] = resolver.resolve('./runtime/server/index')
  },
})
