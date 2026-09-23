import { test, expect } from './support/fixtures'
import { ADMIN_TOKEN, addReaction, createComment, createReply, fetchHtml, uniqueResource } from './support/api'

test.describe('data protection', () => {
  test('self-erasure scrubs PII and preserves threads', async ({ comments, user, secondUser, playwright, baseURL }) => {
    const resource = uniqueResource()
    const parent = await createComment(user, resource, 'Owner comment')
    await createReply(secondUser, parent.id, 'Other user reply')
    await addReaction(user, parent.id, 'like')
    await createComment(user, resource, 'Leaf comment')

    const res = await user.request.delete(`/api/_comments/users/${user.id}`)
    expect(res.status()).toBe(200)
    const result = await res.json() as { success: boolean, comments: number, reactions: number }
    expect(result.success).toBe(true)
    expect(result.comments).toBeGreaterThanOrEqual(1)
    expect(result.reactions).toBeGreaterThanOrEqual(1)

    // The leaf is hard-deleted; the parent survives as a scrubbed tombstone.
    const html = await fetchHtml(playwright, baseURL, resource)
    expect(html).not.toContain('Leaf comment')
    expect(html).not.toContain('Owner comment')
    expect(html).toContain('[deleted]')
    expect(html).toContain('[deleted author]')

    // Replies are lazy-loaded, so the other user's reply is checked via the
    // API (top-level HTML only carries the parent).
    const repliesRes = await user.request.get(`/api/_comments/threads/${parent.id}/replies`)
    const replies = await repliesRes.json() as { items: Array<{ body: string | null }> }
    expect(replies.items.map(r => r.body)).toContain('Other user reply')

    // The UI agrees.
    await comments.goto(resource)
    await expect(comments.body(parent.id)).toHaveText('[deleted]')
    await comments.viewReplies(parent.id)
    await expect(comments.root.getByText('Other user reply')).toBeVisible()
  })

  test('rejects unauthenticated erasure', async ({ playwright, baseURL, user }) => {
    const anon = await playwright.request.newContext({ baseURL })
    try {
      const res = await anon.delete(`/api/_comments/users/${user.id}`)
      expect(res.status()).toBe(401)
    }
    finally {
      await anon.dispose()
    }
  })

  test('rejects erasing another user', async ({ user, secondUser }) => {
    const res = await secondUser.request.delete(`/api/_comments/users/${user.id}`)
    expect(res.status()).toBe(403)
  })

  test('admin token route erases a user', async ({ user }) => {
    const resource = uniqueResource()
    await createComment(user, resource, 'Admin target')

    const res = await user.request.post('/api/admin/delete-user', {
      headers: { 'x-playground-admin-token': ADMIN_TOKEN },
      data: { userId: user.id },
    })
    expect(res.status()).toBe(200)
    const result = await res.json() as { comments: number, reactions: number }
    expect(result.comments).toBeGreaterThanOrEqual(1)

    const list = await user.request.get(`/api/_comments${resource}`)
    const page = await list.json() as { items: unknown[] }
    expect(page.items).toHaveLength(0)
  })

  test('admin route requires the token and a userId', async ({ user }) => {
    const wrongToken = await user.request.post('/api/admin/delete-user', {
      headers: { 'x-playground-admin-token': 'nope' },
      data: { userId: user.id },
    })
    expect(wrongToken.status()).toBe(403)

    const missingUser = await user.request.post('/api/admin/delete-user', {
      headers: { 'x-playground-admin-token': ADMIN_TOKEN },
      data: {},
    })
    expect(missingUser.status()).toBe(422)
  })
})
