import { test, expect } from './support/fixtures'
import { addReaction, createComment, fetchHtml, uniqueResource } from './support/api'

test.describe('SSR and auth', () => {
  test('server-renders existing comments', async ({ playwright, baseURL, user }) => {
    const resource = uniqueResource()
    const body = `SSR comment ${Date.now()}`
    await createComment(user, resource, body)

    // Raw HTML, no JS: the comment must be in the server response.
    const html = await fetchHtml(playwright, baseURL, resource)
    expect(html).toContain(body)
    // Anonymous viewers get the sign-in gate, not the composer.
    expect(html).toContain('Sign in to comment:')
  })

  test('hydrates reactions client-side without a reload', async ({ comments, user, playwright, baseURL }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'Reaction hydration')
    await addReaction(user, comment.id, 'like')

    // SSR content carries no reaction data: the button starts at zero.
    const ssr = await fetchHtml(playwright, baseURL, resource, user.cookies)
    expect(ssr).toContain('like 0')

    // Count the page loads so we can prove hydration did not navigate again.
    await comments.page.addInitScript(() => {
      const w = window as unknown as { __loads?: number }
      w.__loads = (w.__loads ?? 0) + 1
    })
    await comments.goto(resource)

    await expect(comments.reactionButton(comment.id, 'like')).toHaveText('like 1')
    const loads = await comments.page.evaluate(() => (window as unknown as { __loads?: number }).__loads)
    expect(loads).toBe(1)
  })

  test('shows the sign-in gate and no composer when unauthenticated', async ({ page, user }) => {
    const resource = uniqueResource()
    await createComment(user, resource, 'Public comment')

    await page.goto(resource)
    await expect(page.locator('[data-nc-comments-root]')).toBeVisible()
    await expect(page.getByText('Sign in to comment:')).toBeVisible()
    await expect(page.locator('[data-nc-comment-composer]')).toHaveCount(0)

    // Public reads still render content and reactions.
    await expect(page.getByText('Public comment')).toBeVisible()
    await expect(page.locator('[data-nc-reaction-type="like"]').first()).toBeVisible()
  })
})
