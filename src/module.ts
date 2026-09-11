import { defu } from 'defu'
import { defineNuxtModule, addComponent, addImports, addServerHandler, createResolver } from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type { ModuleOptions } from './types'

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
  softDelete: {
    preserveThreadsWithReplies: true,
  },
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

    // Merge options into runtimeConfig (server-only + public).
    nuxt.options.runtimeConfig.comments = defu(
      nuxt.options.runtimeConfig.comments,
      {
        databaseBinding: options.database?.binding ?? 'DB',
        rateLimiter: options.rateLimiter ?? 'memory',
      },
    ) as NonNullable<typeof nuxt.options.runtimeConfig.comments>

    nuxt.options.runtimeConfig.public.comments = defu(
      nuxt.options.runtimeConfig.public.comments as Record<string, unknown> | undefined,
      {
        pagination: options.pagination,
        reactions: { ...options.reactions, types: reactionTypes },
        limits: options.limits,
        softDelete: options.softDelete,
        componentsPrefix: componentPrefix,
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
