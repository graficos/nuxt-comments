import { computed } from 'vue'
import { useAuthClient, useUserSession } from '@nuxtjs/better-auth/composables'

/**
 * Thin wrapper around Better Auth's client/session APIs, exposing a
 * comments-flavored session API. The actual sign-in/sign-out flow is
 * owned by Better Auth (and the consumer's `app/auth.config.ts`).
 *
 * `signIn(provider, options)` delegates to the Better Auth client's
 * social sign-in. Provider names are consumer-owned (google, github,
 * apple, discord, ...). The package ships no provider-specific UI
 * assets — the consumer renders login buttons via the `#login` slot.
 *
 * `useUserSession` and `useAuthClient` are imported explicitly from
 * `@nuxtjs/better-auth/composables`. Nuxt auto-imports are not applied to
 * files resolved from `node_modules`, so relying on them breaks the
 * published build.
 */
export function useCommentsSession() {
  const session = useUserSession()
  const client = useAuthClient()

  async function signIn(provider: string, options?: { callbackURL?: string }) {
    if (!client) {
      throw new Error('[nuxt-comments] Better Auth client is unavailable')
    }
    await client.signIn.social({
      provider,
      callbackURL: options?.callbackURL ?? (typeof window !== 'undefined' ? window.location.href : undefined),
    })
  }

  async function signOut() {
    await session.signOut()
  }

  return {
    user: session.user,
    status: computed<'authenticated' | 'unauthenticated' | 'loading'>(() => {
      if (!session.ready.value) return 'loading'
      return session.loggedIn.value ? 'authenticated' : 'unauthenticated'
    }),
    loggedIn: session.loggedIn,
    ready: session.ready,
    signIn,
    signOut,
  }
}
