// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: true,
  },
  dirs: {
    src: ['./playground'],
  },
})
  .append({
    ignores: [
      'dist/**',
      '.nuxt/**',
      'playground/.nuxt/**',
      'playground/.output/**',
      'playground/.wrangler/**',
      'test/worker-configuration.d.ts',
      'coverage/**',
    ],
  })
  .append({
    rules: {
      // Emit overloads are written separately to document each event's
      // payload; combining them would lose that clarity.
      '@typescript-eslint/unified-signatures': 'off',
      // `Comment` / `Comments` are the intended public component names.
      'vue/multi-word-component-names': 'off',
    },
  })
