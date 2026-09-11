<script setup lang="ts">
import { ref, computed, toRef } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useComments } from '../composables/useComments'
import { useCommentsSession } from '../composables/useCommentsSession'
import Comment from './Comment.vue'
import CommentComposer from './CommentComposer.vue'
import CommentAuth from './CommentAuth.vue'
import type { Comment as CommentType } from '../../shared/types'

/** Slots forwarded from <Comments> to each nested <Comment>. */
const commentSlots = ['comment', 'comment-author', 'comment-body', 'comment-actions', 'reaction', 'reply'] as const

const props = defineProps<{
  /** Opaque resource identifier (e.g. '/blog/my-post' or 'blog:my-post'). */
  resource: string
  /** Initial page size. */
  limit?: number
  /** Auth providers offered by the consumer (provider names are consumer-owned). */
  providers?: string[]
}>()

const emit = defineEmits<{
  (e: 'create', comment: CommentType): void
  (e: 'update', comment: CommentType): void
  (e: 'delete', comment: CommentType): void
  (e: 'reply', comment: CommentType): void
  (e: 'react', payload: { comment: CommentType, type: string }): void
  (e: 'unreact', payload: { comment: CommentType, type: string }): void
  (e: 'error', error: Error): void
}>()

const config = useRuntimeConfig()
const reactionTypes = computed(() => config.public.comments?.reactions?.types ?? ['like'])

const {
  comments,
  loading,
  error,
  hasMore,
  repliesByComment,
  expanded,
  replyHasMore,
  loadReplies,
  toggleReplies,
  fetchMore,
  refresh,
  createComment,
  reply,
  updateComment,
  deleteComment,
  react,
  unreact,
  appendReply,
  patchReaction,
} = useComments(toRef(props, 'resource'), { limit: props.limit })

const session = useCommentsSession()
const isAuthenticated = computed(() => !!session.user.value)
const currentUserId = computed(() => session.user.value?.id)

// Reply / edit state.
const replyingTo = ref<CommentType | null>(null)
const editing = ref<CommentType | null>(null)
const submitting = ref(false)

function fail(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err))
  error.value = e
  emit('error', e)
}

async function onSubmit(body: string) {
  // Ignore a second submit while the first is still in flight.
  if (submitting.value) return
  submitting.value = true
  try {
    if (editing.value) {
      const updated = await updateComment(editing.value.id, body)
      emit('update', updated)
      editing.value = null
      return
    }
    if (replyingTo.value) {
      const parentId = replyingTo.value.id
      const created = await reply(parentId, body)
      emit('reply', created)
      replyingTo.value = null
      // If the thread is already loaded, insert the reply locally; otherwise
      // open it (page one already includes the new reply).
      if (repliesByComment.value[parentId]) appendReply(created)
      else await toggleReplies(parentId)
      return
    }
    const created = await createComment(body)
    emit('create', created)
    await refresh()
  }
  catch (err) {
    fail(err)
  }
  finally {
    submitting.value = false
  }
}

function startReply(c: CommentType) {
  replyingTo.value = c
  editing.value = null
}
function startEdit(c: CommentType) {
  editing.value = c
  replyingTo.value = null
}
async function onDelete(c: CommentType) {
  try {
    await deleteComment(c.id)
    emit('delete', c)
    await refresh()
  }
  catch (err) {
    fail(err)
  }
}

// Serialize reaction requests per comment+type so rapid toggles apply in order.
const reactionQueues = new Map<string, Promise<unknown>>()
function queueReaction(key: string, task: () => Promise<void>): Promise<void> {
  const tail = reactionQueues.get(key)
  // First request for a key runs immediately; later ones chain after it.
  const run = tail ? tail.then(() => task()) : task()
  reactionQueues.set(key, run.catch(() => {}))
  return run
}
async function onReact(payload: { comment: CommentType, type: string }) {
  const { comment, type } = payload
  const wasActive = comment.viewerReactions?.includes(type) ?? false
  patchReaction(comment.id, type, true)
  try {
    await queueReaction(`${comment.id}:${type}`, () => react(comment.id, type))
    emit('react', payload)
  }
  catch (err) {
    patchReaction(comment.id, type, wasActive)
    fail(err)
  }
}
async function onUnreact(payload: { comment: CommentType, type: string }) {
  const { comment, type } = payload
  const wasActive = comment.viewerReactions?.includes(type) ?? false
  patchReaction(comment.id, type, false)
  try {
    await queueReaction(`${comment.id}:${type}`, () => unreact(comment.id, type))
    emit('unreact', payload)
  }
  catch (err) {
    patchReaction(comment.id, type, wasActive)
    fail(err)
  }
}
async function onToggleReplies(c: CommentType) {
  try {
    await toggleReplies(c.id)
  }
  catch (err) {
    fail(err)
  }
}
async function onLoadReplies(c: CommentType) {
  try {
    await loadReplies(c.id)
  }
  catch (err) {
    fail(err)
  }
}

/** Sign-in action for the `#login` slot (provider names are consumer-owned). */
function signIn(provider: string) {
  return session.signIn(provider)
}

defineOptions({ name: 'Comments' })
</script>

<template>
  <section
    aria-label="Comments"
    data-comments-root
    :data-resource="props.resource"
  >
    <slot
      name="header"
      :resource="props.resource"
      :count="comments.length"
    >
      <h2>Comments</h2>
    </slot>

    <slot
      v-if="loading && comments.length === 0"
      name="loading"
    >
      <p
        aria-busy="true"
        role="status"
      >
        Loading comments…
      </p>
    </slot>

    <slot
      v-else-if="error"
      name="error"
      :error="error"
    >
      <p role="alert">
        Failed to load comments.
      </p>
    </slot>

    <slot
      v-else-if="comments.length === 0"
      name="empty"
    >
      <p>No comments yet.</p>
    </slot>

    <slot
      v-else
      name="list"
      :comments="comments"
    >
      <ol data-comments-list>
        <li
          v-for="c in comments"
          :key="c.id"
        >
          <Comment
            :comment="c"
            :viewer-user-id="currentUserId"
            :reaction-types="reactionTypes"
            :replies-by-comment="repliesByComment"
            :reply-has-more="replyHasMore"
            :reply-expanded="expanded"
            @reply="startReply"
            @edit="startEdit"
            @delete="onDelete"
            @react="onReact"
            @unreact="onUnreact"
            @toggle-replies="onToggleReplies"
            @load-replies="onLoadReplies"
          >
            <!-- Forward the per-comment customization slots to each <Comment>. -->
            <template
              v-for="name in commentSlots"
              #[name]="slotProps"
              :key="name"
            >
              <slot
                :name="name"
                v-bind="slotProps ?? {}"
              />
            </template>
          </Comment>
        </li>
      </ol>
    </slot>

    <slot
      v-if="hasMore"
      name="load-more"
      :fetch-more="fetchMore"
    >
      <button
        type="button"
        :disabled="loading"
        @click="fetchMore"
      >
        Load more
      </button>
    </slot>

    <slot
      v-if="isAuthenticated"
      name="composer"
      :submit="onSubmit"
      :is-submitting="submitting"
    >
      <CommentComposer
        :is-submitting="submitting"
        :placeholder="replyingTo ? `Reply to ${replyingTo.authorName ?? 'comment'}...` : 'Write a comment...'"
        @submit="onSubmit"
      />
    </slot>

    <slot
      v-else
      name="login"
      :sign-in="signIn"
      :providers="props.providers"
    >
      <CommentAuth :providers="props.providers" />
    </slot>

    <slot
      name="footer"
      :resource="props.resource"
    />
  </section>
</template>
