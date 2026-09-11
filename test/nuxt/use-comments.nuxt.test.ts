import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { Ref } from 'vue'
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

function mount(resource: Ref<string>) {
  const scope = effectScope()
  const state = scope.run(() => useComments(resource))!
  return { scope, state }
}

describe('useComments async state', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('a stale load cannot overwrite a newer resource', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    fetchMock.mockImplementationOnce(() => first.promise)
    fetchMock.mockImplementationOnce(() => second.promise)

    const resource = ref('a')
    const { state } = mount(resource)
    await nextTick() // immediate watch -> load('a')

    resource.value = 'b'
    await nextTick() // load('b')

    // Resolve the newer request first, then the stale one.
    second.resolve(page([{ id: 'b1' }]))
    await nextTick()
    first.resolve(page([{ id: 'a1' }]))
    await nextTick()
    await Promise.resolve()

    expect(state.comments.value.map(c => c.id)).toEqual(['b1'])
  })

  it('does not fetch or append a thread twice on a double toggle', async () => {
    fetchMock.mockResolvedValueOnce(page([])) // initial list load

    const resource = ref('a')
    const { state } = mount(resource)
    await Promise.resolve()
    await nextTick()

    const replies = deferred<unknown>()
    fetchMock.mockImplementationOnce(() => replies.promise)

    const p1 = state.toggleReplies('c1')
    const p2 = state.toggleReplies('c1')
    replies.resolve(page([{ id: 'r1' }]))
    await Promise.all([p1, p2])

    // One list request + exactly one replies request.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(state.repliesByComment.value.c1?.map(r => r.id)).toEqual(['r1'])
  })

  it('resets reply state when the resource changes', async () => {
    fetchMock.mockResolvedValue(page([]))
    const resource = ref('a')
    const { state } = mount(resource)
    await Promise.resolve()
    await nextTick()

    state.expanded.value = { c1: true }
    state.repliesByComment.value = { c1: [{ id: 'r1' } as never] }

    resource.value = 'b'
    await nextTick()

    expect(state.expanded.value).toEqual({})
    expect(state.repliesByComment.value).toEqual({})
  })

  it('appendReply prepends the reply and expands the thread', async () => {
    fetchMock.mockResolvedValue(page([]))
    const resource = ref('a')
    const { state } = mount(resource)
    await Promise.resolve()
    await nextTick()

    state.appendReply({ id: 'r1', parentId: 'c1' } as never)
    state.appendReply({ id: 'r2', parentId: 'c1' } as never)

    expect(state.repliesByComment.value.c1?.map(r => r.id)).toEqual(['r2', 'r1'])
    expect(state.expanded.value.c1).toBe(true)
  })

  it('patchReaction updates counts and viewer state in comments and replies', async () => {
    fetchMock.mockResolvedValue(page([]))
    const resource = ref('a')
    const { state } = mount(resource)
    await Promise.resolve()
    await nextTick()

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
})
