<script setup lang="ts">
import type { Comment } from '../../shared/types'

const props = defineProps<{
  comment: Comment
  reactionTypes?: string[]
}>()

const emit = defineEmits<{
  (e: 'react', payload: { comment: Comment, type: string }): void
  (e: 'unreact', payload: { comment: Comment, type: string }): void
}>()

function toggle(type: string) {
  const active = props.comment.viewerReactions?.includes(type) ?? false
  if (active) emit('unreact', { comment: props.comment, type })
  else emit('react', { comment: props.comment, type })
}
</script>

<template>
  <div
    role="group"
    aria-label="Reactions"
    data-reactions
  >
    <template
      v-for="type in props.reactionTypes"
      :key="type"
    >
      <slot
        name="reaction"
        :comment="props.comment"
        :type="type"
        :count="props.comment.reactionCounts?.[type] ?? 0"
        :active="props.comment.viewerReactions?.includes(type) ?? false"
        :toggle="() => toggle(type)"
      >
        <button
          type="button"
          :data-reaction-type="type"
          :data-active="props.comment.viewerReactions?.includes(type) ? 'true' : 'false'"
          :aria-pressed="props.comment.viewerReactions?.includes(type) ?? false"
          :aria-label="`React with ${type}`"
          @click="toggle(type)"
        >
          {{ type }} {{ props.comment.reactionCounts?.[type] ?? 0 }}
        </button>
      </slot>
    </template>
  </div>
</template>
