import { test as base } from '@playwright/test'
import { createUser, type TestUser } from './api'
import { CommentsPage } from './comments-page'

export interface CommentsFixtures {
  /** A signed-in user (real Better Auth session). */
  user: TestUser
  /** A second signed-in user, for cross-user assertions. */
  secondUser: TestUser
  /** The comments page object, authenticated as `user`. */
  comments: CommentsPage
}

/**
 * Test fixtures.
 *
 * `user`/`secondUser` are created through the sign-up API rather than the UI
 * (the playground's login slot is OAuth-only). `comments` injects the `user`
 * session cookie into the browser context and returns the page object.
 */
export const test = base.extend<CommentsFixtures>({
  user: async ({ playwright, baseURL }, use) => {
    const user = await createUser(playwright, baseURL)
    await use(user)
    await user.request.dispose()
  },

  secondUser: async ({ playwright, baseURL }, use) => {
    const user = await createUser(playwright, baseURL)
    await use(user)
    await user.request.dispose()
  },

  comments: async ({ page, user }, use) => {
    await page.context().addCookies(user.cookies)
    await use(new CommentsPage(page))
  },
})

export { expect } from '@playwright/test'
