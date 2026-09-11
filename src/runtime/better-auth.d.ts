/**
 * Ambient global declarations for `@nuxtjs/better-auth` auto-imports.
 *
 * `@nuxtjs/better-auth` (declared as a `moduleDependencies` entry) injects
 * these helpers into the consumer's Nuxt/Nitro auto-imports. They are not
 * package exports and are therefore not resolvable from this module's own
 * typecheck context. These ambient declarations let the module typecheck
 * in isolation; at runtime the consumer's build provides the real
 * implementations via auto-import.
 */

declare function useUserSession(): {
  user: import('vue').Readonly<import('vue').Ref<{ id: string, name?: string | null, image?: string | null } | null>>
  status: import('vue').ComputedRef<'authenticated' | 'unauthenticated' | 'loading'>
  loggedIn: import('vue').ComputedRef<boolean>
  ready: import('vue').ComputedRef<boolean>
  signOut: (options?: { redirectTo?: string }) => Promise<void>
}

interface AuthSocialSignInInput {
  provider: string
  callbackURL?: string
}
interface AuthClient {
  signIn: { social: (input: AuthSocialSignInInput) => Promise<void> }
}
declare function useAuthClient(): AuthClient

declare function getUserSession(event: import('h3').H3Event): Promise<{ user: { id: string, name?: string | null, image?: string | null } | null }>
