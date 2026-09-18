import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      // Deterministic Nuxt auto-imports for server code under test.
      '#imports': path.resolve(root, 'test/mocks/imports.ts'),
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(root, 'migrations')
      const migrations = await readD1Migrations(migrationsPath)
      const authMigrations = await readD1Migrations(path.join(root, 'migrations/auth'))

      return {
        miniflare: {
          // D1 binding named `DB` (the module's default binding name).
          d1Databases: ['DB'],
          // Test-only bindings holding the package's D1 migrations, applied
          // by the setup file via `applyD1Migrations()`.
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEST_AUTH_MIGRATIONS: authMigrations,
          },
        },
      }
    }),
  ],
  test: {
    include: [
      'test/unit/**/*.test.ts',
      'test/api/**/*.test.ts',
    ],
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
