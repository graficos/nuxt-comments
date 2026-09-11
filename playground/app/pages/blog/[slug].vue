<script setup lang="ts">
const slug = useRoute().params.slug as string
const resource = `/blog/${slug}`
</script>

<template>
  <main class="page">
    <article class="post">
      <h1>Blog post: {{ slug }}</h1>
      <p>This is a playground post demonstrating the <code>&lt;Comments&gt;</code> component from <code>nuxt-comments</code>.</p>
      <p>The comment UI below is <strong>unstyled by the package</strong> — this playground owns the styling.</p>
    </article>

    <hr>

    <!--
      The component is unstyled by default. The playground styles it
      via the slots / a wrapping <div>. Provider buttons are text-only
      (the package ships no provider logos/assets).
    -->
    <div class="comments-wrapper">
      <Comments
        :resource="resource"
        :providers="['google', 'github']"
      >
        <template #login="{ signIn, providers }">
          <div class="login">
            <p>Sign in to comment:</p>
            <button
              v-for="p in providers"
              :key="p"
              class="login-btn"
              @click="signIn(p)"
            >
              Continue with {{ p }}
            </button>
          </div>
        </template>
      </Comments>
    </div>
  </main>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
.post h1 { margin-bottom: 0.5rem; }
.comments-wrapper {
  margin-top: 2rem;
  border-top: 1px solid #ddd;
  padding-top: 1rem;
}
.login { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
.login-btn { padding: 0.4rem 0.8rem; }
</style>
