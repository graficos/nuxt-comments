import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ref, h } from 'vue'
import Comments from '../../src/runtime/app/components/Comments.vue'
import type { Comment as CommentType } from '../../src/runtime/shared/types'

const { useCommentsMock, useCommentsSessionMock } = vi.hoisted(() => ({
  useCommentsMock: vi.fn(),
  useCommentsSessionMock: vi.fn(),
}))
vi.mock('../../src/runtime/app/composables/useComments', () => ({
  useComments: useCommentsMock,
}))

// The session composable is our auth boundary; mock it to control the
// viewer and capture sign-in calls without touching better-auth.
vi.mock('../../src/runtime/app/composables/useCommentsSession', () => ({
  useCommentsSession: useCommentsSessionMock,
}))

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
    ...overrides,
  }
}

function mockSession(user: { id: string, name?: string | null, image?: string | null } | null) {
  const signIn = vi.fn().mockResolvedValue(undefined)
  const signOut = vi.fn().mockResolvedValue(undefined)
  useCommentsSessionMock.mockReturnValue({
    user: ref(user),
    status: ref(user ? 'authenticated' : 'unauthenticated'),
    loggedIn: ref(user !== null),
    ready: ref(true),
    signIn,
    signOut,
  })
  return { signIn, signOut }
}

function mockComposable(overrides?: {
  comments?: CommentType[]
  loading?: boolean
  error?: Error | null
}) {
  const state = {
    comments: ref(overrides?.comments ?? []),
    loading: ref(overrides?.loading ?? false),
    error: ref(overrides?.error ?? null),
    hasMore: ref(false),
    repliesByComment: ref<Record<string, CommentType[]>>({}),
    expanded: ref<Record<string, boolean>>({}),
    replyHasMore: ref<Record<string, boolean>>({}),
    loadReplies: vi.fn().mockResolvedValue(undefined),
    toggleReplies: vi.fn().mockResolvedValue(undefined),
    fetchMore: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(makeComment({ id: 'c2', userId: 'u1' })),
    reply: vi.fn().mockResolvedValue(makeComment({ id: 'r9', parentId: 'c1', userId: 'u1' })),
    updateComment: vi.fn().mockResolvedValue(makeComment()),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    unreact: vi.fn().mockResolvedValue(undefined),
  }
  useCommentsMock.mockReturnValue(state)
  return state
}

beforeEach(() => {
  useCommentsMock.mockReset()
  useCommentsSessionMock.mockReset()
  mockSession(null)
})

describe('<Comments> (Nuxt environment)', () => {
  it('renders the loading state', async () => {
    mockComposable({ loading: true })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders the empty state', async () => {
    mockComposable()
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.text()).toContain('No comments yet.')
  })

  it('renders the error state', async () => {
    mockComposable({ error: new Error('boom') })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('renders comments', async () => {
    mockComposable({ comments: [makeComment({ body: 'top-level body' })] })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.find('[data-comments-list]').exists()).toBe(true)
    expect(wrapper.text()).toContain('top-level body')
  })

  it('renders nested replies when the thread is expanded', async () => {
    const state = mockComposable({ comments: [makeComment()] })
    const nested = makeComment({ id: 'r1', parentId: 'c1', body: 'nested reply' })
    state.repliesByComment.value = { c1: [nested] }
    state.expanded.value = { c1: true }
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.text()).toContain('nested reply')
  })

  it('hides the composer and shows the login gate when unauthenticated', async () => {
    mockComposable({ comments: [makeComment()] })
    const wrapper = await mountSuspended(Comments, {
      props: { resource: 'blog/x', providers: ['google'] },
    })
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Continue with google')
  })

  it('shows the composer when authenticated and submits via createComment', async () => {
    mockSession({ id: 'u1', name: 'Alice' })
    const state = mockComposable({ comments: [makeComment({ userId: 'u2' })] })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    const form = wrapper.find('form')
    expect(form.exists()).toBe(true)
    await form.find('textarea').setValue('new comment')
    await form.trigger('submit')
    expect(state.createComment).toHaveBeenCalledWith('new comment')
    expect(state.refresh).toHaveBeenCalled()
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('deletes the viewer\'s own comment', async () => {
    mockSession({ id: 'u1', name: 'Alice' })
    const state = mockComposable({ comments: [makeComment({ userId: 'u1' })] })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    await wrapper.find('button[aria-label="Delete comment c1"]').trigger('click')
    expect(state.deleteComment).toHaveBeenCalledWith('c1')
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('cannot edit another user\'s comment (edit buttons hidden)', async () => {
    mockSession({ id: 'u1', name: 'Alice' })
    mockComposable({ comments: [makeComment({ userId: 'u2' })] })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    expect(wrapper.findAll('button').some(b => b.text() === 'Edit')).toBe(false)
    expect(wrapper.findAll('button').some(b => b.text() === 'Delete')).toBe(false)
  })

  it('shows edit controls for a nested reply only when the viewer owns it', async () => {
    mockSession({ id: 'u1', name: 'Alice' })
    const state = mockComposable({ comments: [makeComment({ id: 'c1', userId: 'u1' })] })
    state.repliesByComment.value = { c1: [makeComment({ id: 'r1', parentId: 'c1', userId: 'u2' })] }
    state.expanded.value = { c1: true }
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    const nested = wrapper.findAll('article')[1]!
    expect(nested.findAll('button').some(b => b.text() === 'Edit')).toBe(false)
  })

  it('toggles a reaction through the composable', async () => {
    mockSession({ id: 'u1', name: 'Alice' })
    const state = mockComposable({ comments: [makeComment({ userId: 'u2' })] })
    const wrapper = await mountSuspended(Comments, { props: { resource: 'blog/x' } })
    await wrapper.find('[data-reaction-type="like"]').trigger('click')
    expect(state.react).toHaveBeenCalledWith('c1', 'like')
    expect(wrapper.emitted('react')).toHaveLength(1)
  })

  it('supports a custom comment-body slot with typed data', async () => {
    mockComposable({ comments: [makeComment({ body: 'the body' })] })
    const wrapper = await mountSuspended(Comments, {
      props: { resource: 'blog/x' },
      slots: {
        'comment-body': `<template #comment-body="{ comment }"><div class="custom-body">{{ comment.body }}</div></template>`,
      },
    })
    expect(wrapper.find('.custom-body').text()).toBe('the body')
  })

  it('exposes the login slot with a working signIn action', async () => {
    mockComposable({ comments: [makeComment()] })
    const { signIn } = mockSession(null)
    const wrapper = await mountSuspended(Comments, {
      props: { resource: 'blog/x', providers: ['github'] },
      slots: {
        login: ({ signIn: slotSignIn }: { signIn: (provider: string) => Promise<void> }) =>
          h('button', { class: 'custom-login', onClick: () => slotSignIn('github') }, 'Custom'),
      },
    })
    const btn = wrapper.find('.custom-login')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(signIn).toHaveBeenCalledWith('github')
  })
})
