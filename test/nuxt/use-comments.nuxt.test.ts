import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { EffectScope, Ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtData } from '#imports'
import { useComments } from '../../src/runtime/app/composables/useComments'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ $fetch: fetchMock }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function page(items: Array<{ id: string }>, nextCursor: string | null = null, hasMore = false) {
  return { items, nextCursor, hasMore }
}

function urlOf(call: unknown[]): string {
  return String(call[0])
}

// Per-endpoint response queues. Reactions hydration always resolves to an empty
// batch unless a test enqueues one, so it never interferes with list/reply
// assertions.
let listResponses: unknown[]
let replyResponses: unknown[]
let reactionsResponses: unknown[]

function installRouter() {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url)
    if (u.includes('/threads/reactions')) return Promise.resolve(reactionsResponses.shift() ?? { items: [] })
    if (u.includes('/replies')) return Promise.resolve(replyResponses.shift() ?? page([]))
    return Promise.resolve(listResponses.shift() ?? page([]))
  })
}

let activeScope: EffectScope | undefined

function mount(resource: Ref<string>) {
  const scope = effectScope()
  activeScope = scope
  const state = scope.run(() => useComments(resource))!
  return { scope, state }
}

describe('useComments async state', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    clearNuxtData()
    listResponses = []
    replyResponses = []
    reactionsResponses = []
    installRouter()
  })

  afterEach(() => {
    activeScope?.stop()
    activeScope = undefined
    clearNuxtData()
  })

  it('a stale load cannot overwrite a newer resource', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    let listCall = 0
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/threads/reactions')) return Promise.resolve({ items: [] })
      listCall += 1
      return listCall === 1 ? first.promise : second.promise
    })

    const resource = ref('a')
    const { state } = mount(resource)
    await flushPromises()

    resource.value = 'b'
    await flushPromises()

    // Resolve the newer request first, then the stale one.
    second.resolve(page([{ id: 'b1' }]))
    await flushPromises()
    first.resolve(page([{ id: 'a1' }]))
    await flushPromises()

    expect(state.comments.value.map(c => c.id)).toEqual(['b1'])
  })

  it('does not fetch or append a thread twice on a double toggle', async () => {
    listResponses.push(page([]))

    const replies = deferred<unknown>()
    replyResponses.push(replies.promise)

    const { state } = mount(ref('a'))
    await flushPromises()

    const p1 = state.toggleReplies('c1')
    const p2 = state.toggleReplies('c1')
    replies.resolve(page([{ id: 'r1' }]))
    await Promise.all([p1, p2])
    await flushPromises()

    const replyCalls = fetchMock.mock.calls.filter(call => urlOf(call).includes('/replies'))
    expect(replyCalls).toHaveLength(1)
    expect(state.repliesByComment.value.c1?.map(r => r.id)).toEqual(['r1'])
  })

  it('resets reply state when the resource changes', async () => {
    const resource = ref('a')
    const { state } = mount(resource)
    await flushPromises()

    state.expanded.value = { c1: true }
    state.repliesByComment.value = { c1: [{ id: 'r1' } as never] }

    resource.value = 'b'
    await nextTick()

    expect(state.expanded.value).toEqual({})
    expect(state.repliesByComment.value).toEqual({})
  })

  it('appendReply prepends the reply and expands the thread', async () => {
    const { state } = mount(ref('a'))
    await flushPromises()

    state.appendReply({ id: 'r1', parentId: 'c1' } as never)
    state.appendReply({ id: 'r2', parentId: 'c1' } as never)

    expect(state.repliesByComment.value.c1?.map(r => r.id)).toEqual(['r2', 'r1'])
    expect(state.expanded.value.c1).toBe(true)
  })

  it('patchReaction updates counts and viewer state in comments and replies', async () => {
    const { state } = mount(ref('a'))
    await flushPromises()

    state.comments.value = [{ id: 'c1', reactionCounts: { like: 1 }, viewerReactions: [] } as never]
    state.repliesByComment.value = {
      c1: [{ id: 'r1', parentId: 'c1', reactionCounts: {}, viewerReactions: [] } as never],
    }

    state.patchReaction('c1', 'like', true)
    state.patchReaction('r1', 'like', true)

    expect(state.comments.value[0]!.reactionCounts).toEqual({ like: 2 })
    expect(state.comments.value[0]!.viewerReactions).toEqual(['like'])
    expect(state.repliesByComment.value.c1![0]!.reactionCounts).toEqual({ like: 1 })
    expect(state.repliesByComment.value.c1![0]!.viewerReactions).toEqual(['like'])
  })

  it('hydrates reactions client-side after the list loads', async () => {
    listResponses.push(page([{ id: 'c1' }, { id: 'c2' }]))
    reactionsResponses.push({
      items: [
        { commentId: 'c1', counts: { like: 2 }, viewerReactions: ['like'] },
        { commentId: 'c2', counts: {}, viewerReactions: [] },
      ],
    })

    const { state } = mount(ref('a'))
    await vi.waitFor(() => {
      expect(state.comments.value.find(c => c.id === 'c1')!.reactionCounts).toEqual({ like: 2 })
    })
    expect(state.comments.value.find(c => c.id === 'c1')!.viewerReactions).toEqual(['like'])
    expect(state.comments.value.find(c => c.id === 'c2')!.reactionCounts).toEqual({})
  })

  it('updateComment patches the comment and its replies in place', async () => {
    const { state } = mount(ref('a'))
    await flushPromises()

    state.comments.value = [{ id: 'c1', body: 'old', updatedAt: 't0', reactionCounts: { like: 1 }, viewerReactions: ['like'], replyCount: 2 } as never]
    state.repliesByComment.value = { c1: [{ id: 'r1', parentId: 'c1', body: 'old reply', updatedAt: 't0' } as never] }

    listResponses.push({ id: 'c1', body: 'new', updatedAt: 't1' })
    await state.updateComment('c1', 'new')
    expect(state.comments.value[0]!.body).toBe('new')
    expect(state.comments.value[0]!.updatedAt).toBe('t1')
    // unrelated state is preserved
    expect(state.comments.value[0]!.reactionCounts).toEqual({ like: 1 })
    expect(state.comments.value[0]!.replyCount).toBe(2)

    listResponses.push({ id: 'r1', body: 'new reply', updatedAt: 't2' })
    await state.updateComment('r1', 'new reply')
    expect(state.repliesByComment.value.c1![0]!.body).toBe('new reply')
  })

  it('builds the encoded resource path', async () => {
    mount(ref('/blog/my post/ü'))
    await flushPromises()

    const listCalls = fetchMock.mock.calls.filter(call => urlOf(call).includes('/api/_comments/'))
    expect(listCalls[0]![0]).toBe('/api/_comments/blog/my%20post/%C3%BC')
  })

  it('appends the next page and resets on refresh', async () => {
    listResponses.push(page([{ id: 'a' }], 'cursor-1', true))
    listResponses.push(page([{ id: 'b' }]))
    listResponses.push(page([{ id: 'z' }]))

    const { state } = mount(ref('a'))
    await flushPromises()
    expect(state.comments.value.map(c => c.id)).toEqual(['a'])
    expect(state.hasMore.value).toBe(true)

    await state.fetchMore()
    await flushPromises()
    expect(state.comments.value.map(c => c.id)).toEqual(['a', 'b'])

    await state.refresh()
    await flushPromises()
    expect(state.comments.value.map(c => c.id)).toEqual(['z'])
  })

  it('captures a rejected request in error and clears loading', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/threads/reactions')) return Promise.resolve({ items: [] })
      return Promise.reject(new Error('nope'))
    })
    const { state } = mount(ref('a'))
    await flushPromises()

    expect(state.error.value).toBeInstanceOf(Error)
    expect(state.loading.value).toBe(false)
  })
})
