<script setup lang="ts">
</script>

<template>
  <main class="home">
    <h1>nuxt-comments playground</h1>
    <p>Pick a post to see the comments component in action:</p>
    <ul>
      <li><NuxtLink to="/blog/memorylessness">/blog/memorylessness</NuxtLink></li>
      <li><NuxtLink to="/blog/random-walks">/blog/random-walks</NuxtLink></li>
      <li><NuxtLink to="/blog/why-e-is-everywhere">/blog/why-e-is-everywhere</NuxtLink></li>
    </ul>
    <p>
      <NuxtLink to="/admin">Admin: user deletion demo</NuxtLink>
    </p>
  </main>
</template>

<style scoped>
.home { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; font-family: system-ui, sans-serif; }
</style>
