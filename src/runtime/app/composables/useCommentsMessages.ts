import { computed } from 'vue'
import { useRuntimeConfig } from '#imports'
import { defaultCommentsMessages, formatMessage, type CommentsMessages } from '../../shared/messages'

export type CommentsMessageKey = keyof CommentsMessages

/**
 * Resolve the configured component messages.
 *
 * The module writes `defaultCommentsMessages` (merged with the consumer's
 * `comments.messages` overrides) into `runtimeConfig.public.comments.messages`.
 * Defaults are re-applied here so components still render when mounted outside
 * a configured Nuxt runtime (e.g. isolated component tests).
 */
export function useCommentsMessages() {
  const config = useRuntimeConfig()
  const messages = computed<CommentsMessages>(() => ({
    ...defaultCommentsMessages,
    ...(config.public.comments?.messages ?? {}),
  }))

  /** Format a message by key, interpolating `{token}` placeholders. */
  function t(key: CommentsMessageKey, params?: Record<string, string | number>): string {
    return formatMessage(messages.value[key] ?? defaultCommentsMessages[key], params)
  }

  return { messages, t }
}
