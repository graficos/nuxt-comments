<script setup lang="ts">
import { ref } from 'vue'

const userId = ref('')
const adminToken = ref('')
const result = ref<{ comments: number, reactions: number } | null>(null)
const err = ref<string | null>(null)
const busy = ref(false)

async function onDelete() {
  busy.value = true
  err.value = null
  result.value = null
  try {
    // The package ships no HTTP endpoint for user deletion. This playground
    // route owns its own authorization (see
    // server/api/admin/delete-user.post.ts) and calls the server-only
    // `deleteCommentsUser(event, userId)` utility.
    result.value = await $fetch<{ comments: number, reactions: number }>('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'x-playground-admin-token': adminToken.value },
      body: { userId: userId.value },
    })
  }
  catch (e: unknown) {
    err.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="admin">
    <h1>Admin — user deletion</h1>
    <p>
      Demonstrates the server-side
      <code>deleteCommentsUser(event, userId)</code> utility from
      <code>#comments/server</code>. The package exposes
      <strong>no</strong> admin HTTP endpoint — this playground wires the
      utility behind a gated route.
    </p>
    <p>
      Set <code>PLAYGROUND_ADMIN_TOKEN</code> in your environment and paste
      the same value below.
    </p>
    <form @submit.prevent="onDelete">
      <label>
        Better Auth user ID to delete:
        <input
          v-model="userId"
          type="text"
          placeholder="user id"
          required
        >
      </label>
      <label>
        Admin token:
        <input
          v-model="adminToken"
          type="password"
          placeholder="PLAYGROUND_ADMIN_TOKEN"
          required
        >
      </label>
      <button
        type="submit"
        :disabled="busy"
      >
        Delete user data
      </button>
    </form>
    <p
      v-if="err"
      role="alert"
    >
      Error: {{ err }}
    </p>
    <p v-else-if="result">
      Deleted: {{ result.comments }} comment(s), {{ result.reactions }} reaction(s).
    </p>
  </main>
</template>

<style scoped>
.admin { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; font-family: system-ui, sans-serif; }
form { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; margin-top: 1rem; }
input { padding: 0.4rem; min-width: 320px; }
button { padding: 0.4rem 0.8rem; }
</style>
