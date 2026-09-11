/**
 * `#imports` stub for the workers test runtime. The real Nuxt runtime
 * provides these; tests need a deterministic runtime config.
 */
export function useRuntimeConfig() {
  return {
    comments: { databaseBinding: 'DB', rateLimiter: 'memory' },
    public: {
      comments: {
        pagination: { pageSize: 20, maxPageSize: 100 },
        reactions: { enabled: true, types: ['like', 'heart'] },
        limits: { maxBodyLength: 4000, maxResourceLength: 512 },
        softDelete: { preserveThreadsWithReplies: true },
        componentsPrefix: 'Nuxt',
      },
    },
  }
}
