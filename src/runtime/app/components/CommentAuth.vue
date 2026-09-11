<script setup lang="ts">
import { useCommentsSession } from '../composables/useCommentsSession'

const props = defineProps<{
  /** Optional list of provider names to offer. Consumer-owned. */
  providers?: string[]
}>()

const session = useCommentsSession()

async function signIn(provider: string) {
  await session.signIn(provider)
}
</script>

<template>
  <div
    role="group"
    aria-label="Sign in to comment"
    data-comment-auth
  >
    <slot
      name="login"
      :sign-in="signIn"
      :providers="props.providers"
    >
      <p>You need to be signed in to comment.</p>
      <ul>
        <li
          v-for="provider in props.providers"
          :key="provider"
        >
          <button
            type="button"
            @click="signIn(provider)"
          >
            Continue with {{ provider }}
          </button>
        </li>
      </ul>
    </slot>
  </div>
</template>
