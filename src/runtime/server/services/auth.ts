import type { H3Event } from 'h3'
// `getUserSession` is a Nitro auto-import registered by `@nuxtjs/better-auth`
// (`addServerImports`). It is available on the consumer's `#imports` at runtime
// but not on this module's isolated `#imports` type surface.
// @ts-expect-error - provided by @nuxtjs/better-auth
import { getUserSession } from '#imports'

export interface ViewerInfo {
  id: string
  name: string | null
  image: string | null
}

interface SessionLike {
  user: { id: string, name?: string | null, image?: string | null } | null
}

/**
 * Resolve the current authenticated Better Auth user from the session.
 * Returns `null` when unauthenticated (public read paths use this).
 *
 * Depends on `@nuxtjs/better-auth` (declared via `moduleDependencies`).
 */
export async function getViewer(event: H3Event): Promise<ViewerInfo | null> {
  try {
    const session = await (getUserSession as unknown as (event: H3Event) => Promise<SessionLike>)(event)
    if (!session?.user) return null
    return {
      id: session.user.id,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    }
  }
  catch (err) {
    // Surface the failure instead of silently treating an auth-backend outage
    // as an anonymous request; public reads still proceed as anonymous.
    console.error('[nuxt-comments] failed to resolve session; treating request as anonymous:', err)
    return null
  }
}
