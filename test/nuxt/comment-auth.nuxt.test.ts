import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import CommentAuth from '../../src/runtime/app/components/CommentAuth.vue'

// The session composable is our auth boundary; mock it to capture the
// social sign-in call without performing network requests.
const { useCommentsSessionMock } = vi.hoisted(() => ({ useCommentsSessionMock: vi.fn() }))
vi.mock('../../src/runtime/app/composables/useCommentsSession', () => ({
  useCommentsSession: useCommentsSessionMock,
}))

beforeEach(() => {
  useCommentsSessionMock.mockReset()
})

function mockSession() {
  const signIn = vi.fn().mockResolvedValue(undefined)
  useCommentsSessionMock.mockReturnValue({
    user: ref(null),
    status: ref('unauthenticated'),
    loggedIn: ref(false),
    ready: ref(true),
    signIn,
    signOut: vi.fn().mockResolvedValue(undefined),
  })
  return { signIn }
}

describe('<CommentAuth> (Nuxt environment)', () => {
  it('renders generic text-only default login buttons (no provider assets)', async () => {
    mockSession()
    const wrapper = await mountSuspended(CommentAuth, {
      props: { providers: ['google', 'github'] },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.text()).toBe('Continue with google')
    expect(buttons[1]!.text()).toBe('Continue with github')
    // no provider logos/assets are shipped by the package
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('delegates signIn to the session composable with the chosen provider', async () => {
    const { signIn } = mockSession()
    const wrapper = await mountSuspended(CommentAuth, {
      props: { providers: ['github'] },
    })
    await wrapper.find('button').trigger('click')
    expect(signIn).toHaveBeenCalledWith('github')
  })

  it('exposes the #login slot with the signIn action (consumer owns the UI)', async () => {
    const { signIn } = mockSession()
    const wrapper = await mountSuspended(CommentAuth, {
      props: { providers: ['github'] },
      slots: {
        login: `<template #login="{ signIn }"><button class="custom-login" @click="signIn('apple')">Custom</button></template>`,
      },
    })
    const btn = wrapper.find('.custom-login')
    expect(btn.exists()).toBe(true)
    // default content is fully replaced (no provider buttons rendered)
    expect(wrapper.findAll('button')).toHaveLength(1)
    await btn.trigger('click')
    expect(signIn).toHaveBeenCalledWith('apple')
  })
})
