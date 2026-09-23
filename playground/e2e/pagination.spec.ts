import { test, expect } from './support/fixtures'
import { createComment, uniqueResource } from './support/api'

test.describe('pagination', () => {
  test('loads more top-level comments', async ({ comments, user }) => {
    const resource = uniqueResource()
    // The default page size is 20; seed one more than a full page.
    await Promise.all(
      Array.from({ length: 21 }, (_, i) => createComment(user, resource, `Comment ${i}`)),
    )

    await comments.goto(resource)
    await expect(comments.listItems).toHaveCount(20)

    await comments.loadMoreButton.click()
    await expect(comments.listItems).toHaveCount(21)
    await expect(comments.loadMoreButton).toHaveCount(0)
  })
})
