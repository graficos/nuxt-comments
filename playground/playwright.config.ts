import { defineConfig, devices } from '@playwright/test'
import { ADMIN_TOKEN, TEST_SECRET } from './e2e/support/api'

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

/**
 * Playwright config for the playground e2e suite.
 *
 * The web server is a real `nuxt dev` instance on a dedicated port (3100) so
 * it never clashes with a running `pnpm dev`. `e2e:serve` wipes the local D1
 * state and re-applies the comments + Better Auth migrations before booting,
 * so every run starts from a fresh database.
 *
 * `reuseExistingServer` is false on purpose: a reused server would skip the
 * reset and the env below, making results non-deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // forbids test.only()
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run e2e:serve',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Test-only values; never used outside the local/CI e2e server.
      NUXT_BETTER_AUTH_SECRET: TEST_SECRET,
      NUXT_PUBLIC_SITE_URL: BASE_URL,
      PLAYGROUND_ADMIN_TOKEN: ADMIN_TOKEN,
    },
  },
})
