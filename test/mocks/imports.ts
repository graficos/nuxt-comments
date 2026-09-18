/**
 * `#imports` stub for the workers test runtime. The real Nuxt runtime
 * provides these; tests need a deterministic runtime config and a
 * controllable session.
 */
import { getTestUser } from '../helpers/session'

export async function getUserSession(_event: unknown) {
  return { user: getTestUser() }
}

export function useRuntimeConfig() {
  return {
    comments: { databaseBinding: 'DB', rateLimiter: 'memory' },
    public: {
      comments: {
        pagination: { pageSize: 20, maxPageSize: 100 },
        reactions: { enabled: true, types: ['like', 'heart'] },
        limits: { maxBodyLength: 4000, maxResourceLength: 512 },
        componentsPrefix: 'Nuxt',
      },
    },
  }
}
