<script setup lang="ts">
import type { Comment } from '../../shared/types'

const props = defineProps<{
  comment: Comment
  /** Whether the current viewer can edit/delete this comment. */
  canEdit?: boolean
  /** Allowed reaction types (from runtimeConfig.public.comments.reactions.types). */
  reactionTypes?: string[]
  /** Replies loaded per comment id (lazy thread expansion, shared down the tree). */
  repliesByComment?: Record<string, Comment[]>
  /** Whether more replies can be loaded, per comment id. */
  replyHasMore?: Record<string, boolean>
  /** Whether a reply thread is expanded, per comment id. */
  replyExpanded?: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'reply', comment: Comment): void
  (e: 'edit', comment: Comment): void
  (e: 'delete', comment: Comment): void
  (e: 'react', payload: { comment: Comment, type: string }): void
  (e: 'unreact', payload: { comment: Comment, type: string }): void
  (e: 'toggle-replies', comment: Comment): void
  (e: 'load-replies', comment: Comment): void
}>()

function onReply() {
  emit('reply', props.comment)
}
function onEdit() {
  emit('edit', props.comment)
}
function onDelete() {
  emit('delete', props.comment)
}
function toggleReaction(type: string) {
  const active = props.comment.viewerReactions?.includes(type) ?? false
  if (active) emit('unreact', { comment: props.comment, type })
  else emit('react', { comment: props.comment, type })
}

const replies = (): Comment[] | undefined => props.repliesByComment?.[props.comment.id]
const hasMore = (): boolean | undefined => props.replyHasMore?.[props.comment.id]
const expanded = (): boolean | undefined => props.replyExpanded?.[props.comment.id]

defineOptions({ name: 'Comment' })
</script>

<template>
  <article
    role="comment"
    :aria-label="comment.authorName ? `Comment by ${comment.authorName}` : 'Comment by deleted author'"
    :data-comment-id="comment.id"
  >
    <slot
      name="comment"
      :comment="comment"
    >
      <slot
        name="comment-author"
        :comment="comment"
      >
        <span :data-author-id="comment.userId">
          {{ comment.authorName ?? '[deleted author]' }}
        </span>
      </slot>

      <slot
        name="comment-body"
        :comment="comment"
      >
        <p
          v-if="comment.body"
          style="white-space: pre-wrap"
        >
          {{ comment.body }}
        </p>
        <p
          v-else
          :data-deleted="comment.deletedAt ? 'true' : 'false'"
        >
          [deleted]
        </p>
      </slot>

      <slot
        name="comment-actions"
        :comment="comment"
        :can-edit="canEdit"
        :can-delete="canEdit"
        :on-reply="onReply"
        :on-edit="onEdit"
        :on-delete="onDelete"
      >
        <button
          type="button"
          :aria-label="`Reply to comment ${comment.id}`"
          @click="onReply"
        >
          Reply
        </button>
        <button
          v-if="canEdit"
          type="button"
          :aria-label="`Edit comment ${comment.id}`"
          @click="onEdit"
        >
          Edit
        </button>
        <button
          v-if="canEdit"
          type="button"
          :aria-label="`Delete comment ${comment.id}`"
          @click="onDelete"
        >
          Delete
        </button>
      </slot>

      <slot
        v-for="type in reactionTypes"
        :key="type"
        name="reaction"
        :comment="comment"
        :type="type"
        :count="comment.reactionCounts?.[type] ?? 0"
        :active="comment.viewerReactions?.includes(type) ?? false"
        :toggle="() => toggleReaction(type)"
      >
        <button
          type="button"
          :data-reaction-type="type"
          :data-active="comment.viewerReactions?.includes(type) ? 'true' : 'false'"
          :aria-pressed="comment.viewerReactions?.includes(type) ?? false"
          :aria-label="`React with ${type}`"
          @click="toggleReaction(type)"
        >
          {{ type }} {{ comment.reactionCounts?.[type] ?? 0 }}
        </button>
      </slot>

      <!-- Reply thread: recursively renders <Comment> for each loaded reply. -->
      <slot
        name="reply"
        :comment="comment"
        :replies="replies()"
        :expanded="expanded()"
        :has-more="hasMore()"
        :toggle="() => emit('toggle-replies', comment)"
        :load-more="() => emit('load-replies', comment)"
      >
        <button
          v-if="expanded() === undefined || !expanded()"
          type="button"
          :aria-label="`Show replies to comment ${comment.id}`"
          @click="emit('toggle-replies', comment)"
        >
          View replies
        </button>
        <template v-else>
          <ol data-replies-list>
            <li
              v-for="replyItem in replies()"
              :key="replyItem.id"
            >
              <Comment
                :comment="replyItem"
                :replies-by-comment="repliesByComment"
                :reply-has-more="replyHasMore"
                :reply-expanded="replyExpanded"
                :can-edit="canEdit"
                :reaction-types="reactionTypes"
                @reply="$emit('reply', $event)"
                @edit="$emit('edit', $event)"
                @delete="$emit('delete', $event)"
                @react="$emit('react', $event)"
                @unreact="$emit('unreact', $event)"
                @toggle-replies="$emit('toggle-replies', $event)"
                @load-replies="$emit('load-replies', $event)"
              />
            </li>
            <li v-if="hasMore()">
              <button
                type="button"
                @click="emit('load-replies', comment)"
              >
                Load more replies
              </button>
            </li>
          </ol>
        </template>
      </slot>
    </slot>
  </article>
</template>
