<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  /** Placeholder text for the textarea. */
  placeholder?: string
  /** Whether a submission is in progress. */
  isSubmitting?: boolean
  /** Label for the submit button (consumer-controlled text). */
  submitLabel?: string
  /** Initial textarea value. Used to prefill when editing an existing comment. */
  initialBody?: string
}>()

const emit = defineEmits<{
  (e: 'submit', body: string): void
}>()

const body = ref(props.initialBody ?? '')

// Prefill (or clear) when the composer is opened for editing a comment.
watch(() => props.initialBody, (value) => {
  body.value = value ?? ''
})

/**
 * Emit the comment body. Accepts an explicit value so custom `#composer`
 * slots can submit their own state; falls back to the built-in textarea.
 */
function submit(value?: string) {
  const raw = (value ?? body.value).trim()
  if (!raw) return
  emit('submit', raw)
  body.value = ''
}
</script>

<template>
  <form
    aria-label="Comment composer"
    data-comment-composer
    @submit.prevent="submit()"
  >
    <slot
      name="composer"
      :submit="submit"
      :is-submitting="props.isSubmitting"
      :body="body"
    >
      <textarea
        v-model="body"
        :placeholder="props.placeholder ?? 'Write a comment...'"
        :disabled="props.isSubmitting"
        aria-label="Comment body"
        rows="3"
      />
      <button
        type="submit"
        :disabled="props.isSubmitting || !body.trim()"
      >
        {{ props.submitLabel ?? 'Post' }}
      </button>
    </slot>
  </form>
</template>
