/**
 * Test-only session helper for the workers runtime.
 *
 * The module's server auth utility (`services/auth.ts`) imports
 * `getUserSession` from `#imports`, which the workers test runtime aliases to
 * `test/mocks/imports.ts`. That mock reads the viewer from here.
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
