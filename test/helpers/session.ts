/**
 * Test-only session helper for the workers runtime.
 *
 * The module's server auth utility (`services/auth.ts`) calls the
 * `getUserSession(event)` Nitro auto-import provided by
 * `@nuxtjs/better-auth`. In tests we install our own global
 * implementation and control the viewer per test.
 */
export interface TestUser {
  id: string
  name?: string | null
  image?: string | null
}

let currentUser: TestUser | null = null

export function setTestUser(user: TestUser | null): void {
  currentUser = user
}

export function getTestUser(): TestUser | null {
  return currentUser
}

Object.assign(globalThis, {
  getUserSession: async (_event: unknown) => ({ user: currentUser }),
})
