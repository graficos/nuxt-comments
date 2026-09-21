<script setup lang="ts">
import { computed } from 'vue'
import type { Comment, CommentClasses } from '../../shared/types'
import { useCommentsMessages } from '../composables/useCommentsMessages'

const props = defineProps<{
  comment: Comment
  /** Whether the current viewer can edit/delete this comment (top-level use). */
  canEdit?: boolean
  /** Current viewer id. When set, edit/delete is derived per comment (needed for replies). */
  viewerUserId?: string
  /** Allowed reaction types (from runtimeConfig.public.comments.reactions.types). */
  reactionTypes?: string[]
  /** Replies loaded per comment id (lazy thread expansion, shared down the tree). */
  repliesByComment?: Record<string, Comment[]>
  /** Whether more replies can be loaded, per comment id. */
  replyHasMore?: Record<string, boolean>
  /** Whether a reply thread is expanded, per comment id. */
  replyExpanded?: Record<string, boolean>
  /** Classes applied to each rendered layer and control. */
  classes?: CommentClasses
}>()

/** Ownership of *this* comment — never inherited from a parent comment. */
const canEditResolved = computed(() =>
  props.viewerUserId !== undefined
    ? props.comment.userId === props.viewerUserId && !props.comment.deletedAt
    : (props.canEdit ?? false),
)

// Explicit slot types break the self-referential inference caused by
// forwarding our own slots into the recursive <Comment>.
defineSlots<{
  'comment'?: (props: { comment: Comment }) => unknown
  'comment-author'?: (props: { comment: Comment }) => unknown
  'comment-body'?: (props: { comment: Comment }) => unknown
  'comment-actions'?: (props: {
    comment: Comment
    canEdit: boolean
    canDelete: boolean
    onReply: () => void
    onEdit: () => void
    onDelete: () => void
  }) => unknown
  'reaction'?: (props: {
    comment: Comment
    type: string
    count: number
    active: boolean
    toggle: () => void
  }) => unknown
  'reply'?: (props: {
    comment: Comment
    replies: Comment[] | undefined
    expanded: boolean | undefined
    hasMore: boolean | undefined
    toggle: () => void
    loadMore: () => void
  }) => unknown
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

// Only offer the thread toggle when there is actually something to show:
// `replyCount` comes from the API; the loaded-replies fallback covers a reply
// that was just created locally (the parent's count may not have refreshed).
const hasReplies = computed(() =>
  (props.comment.replyCount ?? 0) > 0 || (replies()?.length ?? 0) > 0,
)

const { t } = useCommentsMessages()

defineOptions({ name: 'Comment' })
</script>

<template>
  <article
    role="comment"
    :class="classes?.root"
    :aria-label="comment.authorName ? t('commentBy', { author: comment.authorName }) : t('commentByDeletedAuthor')"
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
          {{ comment.authorName ?? t('deletedAuthor') }}
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
          {{ t('deleted') }}
        </p>
      </slot>

      <!-- Action row: reply/edit/delete and reactions share one wrapper so a
           consumer can lay them out together (e.g. `display: flex`). -->
      <div
        :class="classes?.footer"
        data-comment-footer
      >
        <slot
          name="comment-actions"
          :comment="comment"
          :can-edit="canEditResolved"
          :can-delete="canEditResolved"
          :on-reply="onReply"
          :on-edit="onEdit"
          :on-delete="onDelete"
        >
          <div
            :class="classes?.actions"
            data-comment-actions
          >
            <button
              type="button"
              :class="classes?.replyButton"
              :aria-label="t('replyToComment', { id: comment.id })"
              @click="onReply"
            >
              {{ t('reply') }}
            </button>
            <button
              v-if="canEditResolved"
              type="button"
              :class="classes?.editButton"
              :aria-label="t('editCommentAria', { id: comment.id })"
              @click="onEdit"
            >
              {{ t('edit') }}
            </button>
            <button
              v-if="canEditResolved"
              type="button"
              :class="classes?.deleteButton"
              :aria-label="t('deleteCommentAria', { id: comment.id })"
              @click="onDelete"
            >
              {{ t('delete') }}
            </button>
          </div>
        </slot>

        <div
          v-if="reactionTypes?.length"
          :class="classes?.reactions"
          data-comment-reactions
        >
          <template
            v-for="type in reactionTypes"
            :key="type"
          >
            <slot
              name="reaction"
              :comment="comment"
              :type="type"
              :count="comment.reactionCounts?.[type] ?? 0"
              :active="comment.viewerReactions?.includes(type) ?? false"
              :toggle="() => toggleReaction(type)"
            >
              <button
                type="button"
                :class="classes?.reactionButton"
                :data-reaction-type="type"
                :data-active="comment.viewerReactions?.includes(type) ? 'true' : 'false'"
                :aria-pressed="comment.viewerReactions?.includes(type) ?? false"
                :aria-label="t('reactWith', { type })"
                @click="toggleReaction(type)"
              >
                {{ type }} {{ comment.reactionCounts?.[type] ?? 0 }}
              </button>
            </slot>
          </template>
        </div>
      </div>

      <!-- Reply thread: recursively renders <Comment> for each loaded reply. -->
      <div
        v-if="hasReplies"
        :class="classes?.replies"
        data-comment-replies
      >
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
            v-if="!expanded()"
            type="button"
            :class="classes?.viewRepliesButton"
            :aria-label="t('showReplies', { id: comment.id })"
            @click="emit('toggle-replies', comment)"
          >
            {{ t('viewReplies') }}
          </button>
          <template v-else>
            <ol
              :class="classes?.repliesList"
              data-replies-list
            >
              <li
                v-for="replyItem in replies()"
                :key="replyItem.id"
                :class="classes?.replyItem"
              >
                <Comment
                  :comment="replyItem"
                  :viewer-user-id="viewerUserId"
                  :replies-by-comment="repliesByComment"
                  :reply-has-more="replyHasMore"
                  :reply-expanded="replyExpanded"
                  :reaction-types="reactionTypes"
                  :classes="classes"
                  @reply="$emit('reply', $event)"
                  @edit="$emit('edit', $event)"
                  @delete="$emit('delete', $event)"
                  @react="$emit('react', $event)"
                  @unreact="$emit('unreact', $event)"
                  @toggle-replies="$emit('toggle-replies', $event)"
                  @load-replies="$emit('load-replies', $event)"
                >
                  <!-- Forward custom per-comment slots to nested replies. -->
                  <template #comment="{ comment: replyComment }">
                    <slot
                      name="comment"
                      :comment="replyComment"
                    />
                  </template>
                  <template #comment-author="{ comment: replyComment }">
                    <slot
                      name="comment-author"
                      :comment="replyComment"
                    />
                  </template>
                  <template #comment-body="{ comment: replyComment }">
                    <slot
                      name="comment-body"
                      :comment="replyComment"
                    />
                  </template>
                  <template #comment-actions="actionProps">
                    <slot
                      name="comment-actions"
                      v-bind="actionProps"
                    />
                  </template>
                  <template #reaction="reactionProps">
                    <slot
                      name="reaction"
                      v-bind="reactionProps"
                    />
                  </template>
                  <template #reply="replyProps">
                    <slot
                      name="reply"
                      v-bind="replyProps"
                    />
                  </template>
                </Comment>
              </li>
              <li
                v-if="hasMore()"
                :class="classes?.replyItem"
              >
                <button
                  type="button"
                  :class="classes?.loadMoreRepliesButton"
                  @click="emit('load-replies', comment)"
                >
                  {{ t('loadMoreReplies') }}
                </button>
              </li>
            </ol>
          </template>
        </slot>
      </div>
    </slot>
  </article>
</template>
