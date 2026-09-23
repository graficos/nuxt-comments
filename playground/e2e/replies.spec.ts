import { test, expect } from './support/fixtures'
import { createComment, createReply, uniqueResource } from './support/api'

test.describe('replies', () => {
  test('adds a reply and opens the thread', async ({ comments, user }) => {
    const resource = uniqueResource()
    const parent = await createComment(user, resource, 'Parent')

    await comments.goto(resource)
    await comments.reply(parent.id, 'A reply')
    await expect(comments.root.getByText('A reply')).toBeVisible()
  })

  test('lazily loads a collapsed reply thread', async ({ comments, user }) => {
    const resource = uniqueResource()
    const parent = await createComment(user, resource, 'Parent with reply')
    await createReply(user, parent.id, 'Hidden reply')

    await comments.goto(resource)
    // Collapsed until expanded.
    await expect(comments.root.getByText('Hidden reply')).toHaveCount(0)
    await comments.viewReplies(parent.id)
    await expect(comments.root.getByText('Hidden reply')).toBeVisible()
  })

  test('deletes a reply but keeps the thread', async ({ comments, user }) => {
    const resource = uniqueResource()
    const parent = await createComment(user, resource, 'Parent')
    const reply = await createReply(user, parent.id, 'Reply to delete')

    await comments.goto(resource)
    await comments.viewReplies(parent.id)
    await comments.deleteComment(reply.id)

    // Deleting refreshes the list, which collapses threads; re-open to check.
    await comments.viewReplies(parent.id)
    await expect(comments.body(reply.id)).toHaveText('[deleted]')
  })

  test('deletes a parent and preserves its reply', async ({ comments, user }) => {
    const resource = uniqueResource()
    const parent = await createComment(user, resource, 'Parent to delete')
    await createReply(user, parent.id, 'Surviving reply')

    await comments.goto(resource)
    await comments.deleteComment(parent.id)
    await expect(comments.body(parent.id)).toHaveText('[deleted]')

    // The thread keeps its shape; the reply is still there.
    await comments.viewReplies(parent.id)
    await expect(comments.root.getByText('Surviving reply')).toBeVisible()
  })
})
