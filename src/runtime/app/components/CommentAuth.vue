<script setup lang="ts">
import { useCommentsSession } from '../composables/useCommentsSession'
import { useCommentsMessages } from '../composables/useCommentsMessages'

const props = defineProps<{
  /** Optional list of provider names to offer. Consumer-owned. */
  providers?: string[]
}>()

const session = useCommentsSession()
const { t } = useCommentsMessages()

async function signIn(provider: string) {
  await session.signIn(provider)
}
</script>

<template>
  <div
    role="group"
    :aria-label="t('signInToComment')"
    data-nc-comment-auth
  >
    <slot
      name="login"
      :sign-in="signIn"
      :providers="props.providers"
    >
      <p>{{ t('signInPrompt') }}</p>
      <ul>
        <li
          v-for="provider in props.providers"
          :key="provider"
        >
          <button
            type="button"
            @click="signIn(provider)"
          >
            {{ t('continueWith', { provider }) }}
          </button>
        </li>
      </ul>
    </slot>
  </div>
</template>
