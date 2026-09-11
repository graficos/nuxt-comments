import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import Comment from '../../src/runtime/app/components/Comment.vue'
import type { Comment as CommentType } from '../../src/runtime/shared/types'

function makeComment(overrides?: Partial<CommentType>): CommentType {
  return {
    id: 'c1',
    resource: 'blog/x',
    userId: 'u1',
    parentId: null,
    body: 'hello',
    authorName: 'Alice',
    authorImage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    deletedBy: null,
    reactionCounts: { like: 2 },
    viewerReactions: [],
    ...overrides,
  }
}

describe('<Comment> (Nuxt environment)', () => {
  it('renders the comment body and author', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment() },
    })
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('hello')
  })

  it('renders a deleted comment as [deleted]', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment({ body: null, deletedAt: 'x', deletedBy: 'author' }) },
    })
    expect(wrapper.text()).toContain('[deleted]')
    expect(wrapper.text()).not.toContain('hello')
  })

  it('renders a deleted author as [deleted author]', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment({ authorName: null }) },
    })
    expect(wrapper.text()).toContain('[deleted author]')
  })

  it('emits edit and delete actions for the owner', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment(), canEdit: true },
    })
    const buttons = wrapper.findAll('button')
    await buttons.find(b => b.text() === 'Edit')!.trigger('click')
    await buttons.find(b => b.text() === 'Delete')!.trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('hides edit/delete when not the owner', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment(), canEdit: false },
    })
    expect(wrapper.findAll('button').some(b => b.text() === 'Edit')).toBe(false)
    expect(wrapper.findAll('button').some(b => b.text() === 'Delete')).toBe(false)
  })

  it('emits reply via the reply action', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment() },
    })
    await wrapper.find('button[aria-label="Reply to comment c1"]').trigger('click')
    expect(wrapper.emitted('reply')).toHaveLength(1)
  })

  it('renders reactions with counts and toggles them', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment(), reactionTypes: ['like'] },
    })
    const btn = wrapper.find('[data-reaction-type="like"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('2')
    expect(btn.attributes('aria-pressed')).toBe('false')
    await btn.trigger('click')
    expect(wrapper.emitted('react')).toEqual([[{ comment: expect.anything(), type: 'like' }]])
  })

  it('renders nested replies recursively (same component inside itself)', async () => {
    const nested = makeComment({ id: 'r1', parentId: 'c1', body: 'nested' })
    const wrapper = await mountSuspended(Comment, {
      props: {
        comment: makeComment(),
        repliesByComment: { c1: [nested] },
        replyExpanded: { c1: true },
      },
    })
    expect(wrapper.find('[data-replies-list]').exists()).toBe(true)
    expect(wrapper.text()).toContain('nested')
    // the recursive instance renders with its own article element
    expect(wrapper.findAll('article')).toHaveLength(2)
  })

  it('shows the toggle button when the thread is not expanded', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment(), repliesByComment: {}, replyExpanded: {} },
    })
    const toggle = wrapper.find('button[aria-label="Show replies to comment c1"]')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    expect(wrapper.emitted('toggle-replies')).toHaveLength(1)
  })

  it('offers a load-more-replies action', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: {
        comment: makeComment(),
        repliesByComment: { c1: [makeComment({ id: 'r1', parentId: 'c1' })] },
        replyExpanded: { c1: true },
        replyHasMore: { c1: true },
      },
    })
    const more = wrapper.findAll('button').find(b => b.text() === 'Load more replies')
    await more!.trigger('click')
    expect(wrapper.emitted('load-replies')).toHaveLength(1)
  })

  it('exposes typed scoped slots (comment-body)', async () => {
    const wrapper = await mountSuspended(Comment, {
      props: { comment: makeComment({ body: 'slot body' }) },
      slots: {
        'comment-body': `<template #comment-body="{ comment }"><div class="custom">{{ comment.body }}</div></template>`,
      },
    })
    expect(wrapper.find('.custom').text()).toBe('slot body')
  })

  it('derives edit/delete per comment from viewerUserId (replies do not inherit)', async () => {
    const parent = makeComment({ id: 'c1', userId: 'u1' })
    const reply = makeComment({ id: 'r1', parentId: 'c1', userId: 'u2' })
    const wrapper = await mountSuspended(Comment, {
      props: {
        comment: parent,
        viewerUserId: 'u1',
        repliesByComment: { c1: [reply] },
        replyExpanded: { c1: true },
      },
    })

    // Parent is owned by the viewer -> Edit/Delete present.
    const outer = wrapper.findAll('article')[0]!
    expect(outer.findAll('button').some(b => b.text() === 'Edit')).toBe(true)

    // Nested reply belongs to u2 -> no Edit/Delete.
    const nested = wrapper.findAll('article')[1]!
    expect(nested.findAll('button').some(b => b.text() === 'Edit')).toBe(false)
    expect(nested.findAll('button').some(b => b.text() === 'Delete')).toBe(false)
  })

  it('forwards custom slots into nested replies', async () => {
    const reply = makeComment({ id: 'r1', parentId: 'c1', body: 'nested body' })
    const wrapper = await mountSuspended(Comment, {
      props: {
        comment: makeComment({ body: 'parent body' }),
        repliesByComment: { c1: [reply] },
        replyExpanded: { c1: true },
      },
      slots: {
        'comment-body': `<template #comment-body="{ comment }"><div class="custom-body">{{ comment.body }}</div></template>`,
      },
    })

    expect(wrapper.findAll('.custom-body').map(n => n.text())).toEqual(['parent body', 'nested body'])
  })
})

// Keep the unused ref import referenced for the reactive props contract.
void ref
