import { computed } from 'vue'

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
 * `useUserSession` and `useAuthClient` are Nuxt auto-imports provided
 * by `@nuxtjs/better-auth` (declared as a `moduleDependencies` entry).
 */
export function useCommentsSession() {
  const session = useUserSession()

  async function signIn(provider: string, options?: { callbackURL?: string }) {
    const client = useAuthClient()
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
    status: session.status,
    loggedIn: computed(() => session.loggedIn.value),
    ready: computed(() => session.ready.value),
    signIn,
    signOut,
  }
}
