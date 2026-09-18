import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'

// Apply the package's D1 migrations (bound as TEST_MIGRATIONS /
// TEST_AUTH_MIGRATIONS by the vitest config) to the test D1 database
// before tests run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
await applyD1Migrations(env.DB, env.TEST_AUTH_MIGRATIONS)
