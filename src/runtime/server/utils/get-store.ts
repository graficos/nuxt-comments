import type { H3Event } from 'h3'
import type { D1Database } from '@cloudflare/workers-types'
import { useRuntimeConfig } from '#imports'
import { D1CommentsStore } from '../repositories/d1-comments-store'
import type { CommentsStore } from '../repositories/comments-store'

/**
 * Resolve the configured D1 binding from the request's Cloudflare
 * context and return a `D1CommentsStore` instance.
 *
 * The binding name is configurable via `comments.database.binding`
 * (module option) → `runtimeConfig.comments.databaseBinding` (runtime).
 *
 * Nuxt exposes Cloudflare bindings on `event.context.cloudflare.env`
 * when the `cloudflare` preset (NuxtHub or nitro-cloudflare) is active.
 */
export function getCommentsStore(event: H3Event): CommentsStore {
  const config = useRuntimeConfig(event)
  const bindingName = config.comments?.databaseBinding ?? 'DB'
  const cloudflare = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare
  const db = cloudflare?.env?.[bindingName]
  if (!db) {
    throw new Error(
      `[nuxt-comments] D1 binding "${bindingName}" not found on event.context.cloudflare.env. `
      + 'Ensure the cloudflare nitro preset is active and the binding is configured in your Wrangler file.',
    )
  }
  return new D1CommentsStore(db as D1Database)
}
