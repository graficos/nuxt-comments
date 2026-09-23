import { test, expect } from './support/fixtures'
import { addReaction, createComment, uniqueResource } from './support/api'

test.describe('reactions', () => {
  test('adds and removes a reaction', async ({ comments, user }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'React to me')

    await comments.goto(resource)
    const like = comments.reactionButton(comment.id, 'like')
    await expect(like).toHaveText('like 0')

    await comments.react(comment.id, 'like')
    await expect(like).toHaveText('like 1')
    await expect(like).toHaveAttribute('data-nc-active', 'true')

    await comments.react(comment.id, 'like')
    await expect(like).toHaveText('like 0')
    await expect(like).toHaveAttribute('data-nc-active', 'false')
  })

  test('persists a reaction across reload', async ({ comments, user }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'Persist')

    await comments.goto(resource)
    await comments.react(comment.id, 'heart')
    await expect(comments.reactionButton(comment.id, 'heart')).toHaveText('heart 1')

    await comments.page.reload()
    await expect(comments.reactionButton(comment.id, 'heart')).toHaveText('heart 1')
    await expect(comments.reactionButton(comment.id, 'heart')).toHaveAttribute('data-nc-active', 'true')
  })

  test('counts reactions from multiple users', async ({ comments, user, secondUser }) => {
    const resource = uniqueResource()
    const comment = await createComment(user, resource, 'Multi user')

    await addReaction(user, comment.id, 'like')
    await addReaction(secondUser, comment.id, 'like')

    await comments.goto(resource)
    await expect(comments.reactionButton(comment.id, 'like')).toHaveText('like 2')
  })
})
