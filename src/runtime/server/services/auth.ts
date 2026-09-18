import type { H3Event } from 'h3'
import * as nitroImports from '#imports'

export interface ViewerInfo {
  id: string
  name: string | null
  image: string | null
}

interface SessionLike {
  user: { id: string, name?: string | null, image?: string | null } | null
}

/**
 * `getUserSession` is a Nitro auto-import provided by `@nuxtjs/better-auth`
 * (registered via `addServerImports`). It lives on the consumer's `#imports`,
 * but not on this module's isolated `#imports` type surface, so we reach it
 * through the namespace and give it a local type.
 */
const nitro = nitroImports as unknown as {
  getUserSession: (event: H3Event) => Promise<SessionLike>
}

/**
 * Resolve the current authenticated Better Auth user from the session.
 * Returns `null` when unauthenticated (public read paths use this).
 *
 * Depends on `@nuxtjs/better-auth` (declared via `moduleDependencies`).
 */
export async function getViewer(event: H3Event): Promise<ViewerInfo | null> {
  try {
    const session = await nitro.getUserSession(event)
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
