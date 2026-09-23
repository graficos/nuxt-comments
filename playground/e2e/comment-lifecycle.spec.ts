import { test, expect } from './support/fixtures'
import { createComment, uniqueResource } from './support/api'

test.describe('comment lifecycle', () => {
  test('posts a comment and persists it across reload', async ({ comments }) => {
    const resource = uniqueResource()
    await comments.goto(resource)
    await expect(comments.root.getByText('No comments yet.')).toBeVisible()

    await comments.post('Hello e2e')
    await expect(comments.root.getByText('Hello e2e')).toBeVisible()

    await comments.page.reload()
    await expect(comments.root.getByText('Hello e2e')).toBeVisible()
  })

  test('edits an owned comment', async ({ comments, user }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'Before edit')

    await comments.goto(resource)
    await comments.edit(comment.id, 'After edit')
    await expect(comments.body(comment.id)).toHaveText('After edit')
  })

  test('deletes an owned comment, then can post again', async ({ comments, user }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'To be deleted')

    await comments.goto(resource)
    await comments.deleteComment(comment.id)
    await expect(comments.body(comment.id)).toHaveText('[deleted]')

    await comments.post('Posted after delete')
    await expect(comments.root.getByText('Posted after delete')).toBeVisible()
  })

  test('renders comment bodies as plain text (no HTML execution)', async ({ comments, page }) => {
    const resource = uniqueResource()
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'

    await comments.goto(resource)
    await comments.post(payload)

    await expect(comments.root.getByText(payload)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })
})
