import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

/**
 * Node/Nuxt-environment test config for module + component tests.
 *
 * The workers-runtime tests (store/api) use the `@cloudflare/vitest-plugin`
 * config (vitest.config.ts); custom Vitest environments are not supported
 * there, so Nuxt-environment tests live in this separate config.
 *
 * The `nuxt` project runs inside a real Nuxt runtime (built from the
 * playground app), giving components real `useRuntimeConfig`, auto-imports
 * and better-auth session APIs. `registerEndpoint` mocks the module's API.
 */
export default defineConfig({
  test: {
    projects: [
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environmentOptions: {
            nuxt: {
              rootDir: 'playground',
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
      {
        test: {
          name: 'module',
          include: ['test/module/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
