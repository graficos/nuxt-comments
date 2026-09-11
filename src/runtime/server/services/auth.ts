import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { unauthenticated } from '../utils/errors'

export interface ViewerInfo {
  id: string
  name: string | null
  image: string | null
}

/**
 * Resolve the current authenticated Better Auth user from the session.
 * Returns `null` when unauthenticated (public read paths use this).
 *
 * Depends on `@nuxtjs/better-auth` (declared via `moduleDependencies`).
 * `getUserSession` is a Nitro auto-import provided by that module.
 */
export async function getViewer(event: H3Event): Promise<ViewerInfo | null> {
  try {
    const session = await getUserSession(event)
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

/** Require an authenticated viewer or throw 401. */
export async function requireViewer(event: H3Event): Promise<ViewerInfo> {
  const viewer = await getViewer(event)
  if (!viewer) {
    throw unauthenticated()
  }
  return viewer
}

export function useCommentsConfig(event: H3Event) {
  return useRuntimeConfig(event).public.comments
}
