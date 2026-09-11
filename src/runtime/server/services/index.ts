import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getCommentsStore } from '../utils/get-store'
import { getRateLimiter } from '../utils/rate-limiter'
import { rateLimited } from '../utils/errors'
import { getViewer } from './auth'
import { createCommentsService, serviceConfigFromRuntimeConfig } from './comments.service'
import type { CommentsService } from './comments.service'

/** Wire a `CommentsService` for a given request event. */
export function useCommentsService(event: H3Event): CommentsService {
  const store = getCommentsStore(event)
  const rc = useRuntimeConfig(event)
  const config = serviceConfigFromRuntimeConfig(rc.public.comments ?? {})
  const limiter = getRateLimiter(rc.comments?.rateLimiter ?? 'memory', {
    trustProxy: rc.comments?.rateLimiterTrustProxy ?? false,
  })
  return createCommentsService({
    store,
    getViewer: () => getViewer(event),
    config,
    checkRateLimit: async (scope) => {
      if (await limiter.isLimited(event, scope)) {
        throw rateLimited()
      }
    },
  })
}
