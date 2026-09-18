import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { h } from 'vue'
import CommentComposer from '../../src/runtime/app/components/CommentComposer.vue'
import CommentReactions from '../../src/runtime/app/components/CommentReactions.vue'
import type { Comment as CommentType } from '../../src/runtime/shared/types'

describe('<CommentComposer>', () => {
  it('submits the trimmed body and clears the field', async () => {
    const wrapper = await mountSuspended(CommentComposer)
    await wrapper.find('textarea').setValue('  hi there  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([['hi there']])
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('does not submit an empty body', async () => {
    const wrapper = await mountSuspended(CommentComposer)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('exposes the #composer slot with a submit callback', async () => {
    const wrapper = await mountSuspended(CommentComposer, {
      slots: {
        composer: ({ submit }: { submit: (body?: string) => void }) =>
          h('button', { 'data-test': 'custom', 'onClick': () => submit('from slot') }, 'Go'),
      },
    })
    await wrapper.find('[data-test="custom"]').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([['from slot']])
  })

  it('prefills from initialBody and follows changes (edit mode)', async () => {
    const wrapper = await mountSuspended(CommentComposer, {
      props: { initialBody: 'original text' },
    })
    const value = () => (wrapper.find('textarea').element as HTMLTextAreaElement).value
    expect(value()).toBe('original text')
    await wrapper.setProps({ initialBody: 'updated text' })
    expect(value()).toBe('updated text')
    await wrapper.setProps({ initialBody: '' })
    expect(value()).toBe('')
  })
})

describe('<CommentReactions>', () => {
  function comment(): CommentType {
    return {
      id: 'c1',
      resource: 'blog/x',
      userId: 'u1',
      parentId: null,
      body: 'hi',
      authorName: null,
      authorImage: null,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      deletedBy: null,
      reactionCounts: { like: 3, heart: 0 },
      viewerReactions: ['like'],
    }
  }

  it('renders configured reaction types with counts', async () => {
    const wrapper = await mountSuspended(CommentReactions, {
      props: { comment: comment(), reactionTypes: ['like', 'heart'] },
    })
    expect(wrapper.find('[data-reaction-type="like"]').text()).toContain('3')
    expect(wrapper.find('[data-reaction-type="heart"]').exists()).toBe(true)
  })

  it('marks the viewer\'s active reaction (aria-pressed)', async () => {
    const wrapper = await mountSuspended(CommentReactions, {
      props: { comment: comment(), reactionTypes: ['like', 'heart'] },
    })
    expect(wrapper.find('[data-reaction-type="like"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-reaction-type="heart"]').attributes('aria-pressed')).toBe('false')
  })

  it('emits unreact for active and react for inactive types', async () => {
    const wrapper = await mountSuspended(CommentReactions, {
      props: { comment: comment(), reactionTypes: ['like', 'heart'] },
    })
    await wrapper.find('[data-reaction-type="like"]').trigger('click')
    await wrapper.find('[data-reaction-type="heart"]').trigger('click')
    expect(wrapper.emitted('unreact')).toHaveLength(1)
    expect(wrapper.emitted('react')).toHaveLength(1)
  })

  it('exposes the reaction slot with typed data', async () => {
    const wrapper = await mountSuspended(CommentReactions, {
      props: { comment: comment(), reactionTypes: ['like'] },
      slots: {
        reaction: `<template #reaction="{ type, count, active }"><span class="r" :data-active="active">{{ type }}:{{ count }}</span></template>`,
      },
    })
    const el = wrapper.find('.r')
    expect(el.text()).toBe('like:3')
    expect(el.attributes('data-active')).toBe('true')
  })
})
