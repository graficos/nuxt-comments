import { describe, it, expect, beforeAll } from 'vitest'
import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, NuxtHooks } from '@nuxt/schema'
import Module, { buildD1DatabaseCode } from '../../src/module'
import type { ModuleOptions } from '../../src/types'

let nuxt: Nuxt

beforeAll(async () => {
  nuxt = await loadNuxt({ cwd: 'playground' })
})

describe('nuxt-comments module (static)', () => {
  it('exposes meta with the documented configKey, name and compatibility', async () => {
    const meta = await Module.getMeta!()
    expect(meta.configKey).toBe('comments')
    expect(meta.name).toBe('nuxt-comments')
    expect(meta.compatibility?.nuxt).toBe('>=4.0.0')
  })

  it('exposes documented defaults via getOptions', async () => {
    // A bare context (no `comments` config) yields pure module defaults.
    const bare = { options: {} } as Nuxt
    const options = await Module.getOptions!({}, bare) as ModuleOptions
    expect(options).toMatchObject({
      database: { binding: 'DB' },
      pagination: { pageSize: 20, maxPageSize: 100 },
      reactions: { enabled: true },
      limits: { maxBodyLength: 4000, maxResourceLength: 512 },
      components: { prefix: 'Nuxt' },
      rateLimiter: 'memory',
    })
  })

  it('declares @nuxtjs/better-auth as a module dependency', async () => {
    const deps = await Module.getModuleDependencies!(nuxt) as Record<string, { version?: string }> | undefined
    expect(deps?.['@nuxtjs/better-auth']).toBeDefined()
    expect(deps?.['@nuxtjs/better-auth']?.version).toBe('>=0.3.0 <1.0.0')
  })

  it('generates a D1 database factory that names the binding', () => {
    const code = buildD1DatabaseCode('AUTH_DB')
    expect(code).toContain('"AUTH_DB"')
    expect(code).toContain('not found on event.context.cloudflare.env')
    expect(code).toContain('export const db = undefined')
    // prerender runs without a Cloudflare runtime: fall back instead of throwing
    expect(code).toContain('if (import.meta.prerender) return undefined')
  })
})

describe('nuxt-comments module (installed in the playground app)', () => {
  it('merges module options into runtimeConfig (server + public)', () => {
    expect(nuxt.options.runtimeConfig.comments?.databaseBinding).toBe('DB')
    const pub = nuxt.options.runtimeConfig.public?.comments
    expect(pub?.pagination?.pageSize).toBe(20)
    expect(pub?.reactions?.enabled).toBe(true)
    // the playground configures three reaction types, without duplicates
    expect(pub?.reactions?.types).toEqual(['like', 'heart', 'laugh'])
    // the playground opts out of the component prefix
    expect(pub?.componentsPrefix).toBe('')
    // no secrets leak into the public runtime config
    expect(JSON.stringify(pub)).not.toMatch(/secret/i)
  })

  it('registers the namespaced server handlers', () => {
    const handlers = nuxt.options.serverHandlers.map(h => ({ route: h.route, method: h.method }))
    expect(handlers).toEqual(expect.arrayContaining([
      { route: '/api/_comments/**:resource', method: 'GET' },
      { route: '/api/_comments/**:resource', method: 'POST' },
      { route: '/api/_comments/threads/:commentId', method: 'PATCH' },
      { route: '/api/_comments/threads/:commentId', method: 'DELETE' },
      { route: '/api/_comments/threads/:commentId/replies', method: 'GET' },
      { route: '/api/_comments/threads/:commentId/replies', method: 'POST' },
      { route: '/api/_comments/threads/:commentId/reactions', method: 'POST' },
      { route: '/api/_comments/threads/:commentId/reactions/:type', method: 'DELETE' },
    ]))
    // every handler of ours lives in the internal namespace
    const ours = handlers.filter(h => (h.route ?? '').startsWith('/api/_comments'))
    expect(ours.length).toBeGreaterThan(0)
    expect(ours.every(h => (h.route ?? '').startsWith('/api/_comments'))).toBe(true)
  })

  it('exposes the components with the configured prefix', async () => {
    const components: Parameters<NuxtHooks['components:extend']>[0] = []
    await nuxt.callHook('components:extend', components)
    const names = components.map(c => c.pascalName)
    // playground sets components.prefix: '' → unprefixed names
    for (const name of ['Comments', 'Comment', 'CommentComposer', 'CommentReactions', 'CommentAuth']) {
      expect(names).toContain(name)
    }
  })

  it('exposes the composables via auto-imports', async () => {
    const imports: Parameters<NuxtHooks['imports:extend']>[0] = []
    await nuxt.callHook('imports:extend', imports)
    const names = imports.map(i => i.name)
    expect(names).toContain('useComments')
    expect(names).toContain('useCommentsSession')
  })

  it('auto-installs @nuxtjs/better-auth via moduleDependencies', () => {
    // better-auth registers its auth API route; its presence proves the
    // module dependency was installed without the consumer listing it.
    const routes = nuxt.options.serverHandlers.map(h => h.route)
    expect(routes).toContain('/api/auth/**')
  })

  it('registers the opt-in D1 database provider for Better Auth', async () => {
    const providers: Record<string, { priority?: number, isEnabled?: (ctx: unknown) => boolean, buildDatabaseCode: () => string }> = {}
    await nuxt.callHook('better-auth:database:providers', providers)

    const provider = providers['comments-d1']
    expect(provider).toBeDefined()
    expect(provider!.priority).toBe(50)
    expect(provider!.isEnabled!({ hasHubDbAvailable: false, clientOnly: false })).toBe(true)
    expect(provider!.isEnabled!({ hasHubDbAvailable: true, clientOnly: false })).toBe(false)

    const code = provider!.buildDatabaseCode()
    expect(code).toContain('"DB"')
    expect(code).toContain('return db')
    expect(code).toContain('export const db = undefined')
  })
})
