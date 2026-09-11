import type { CommentsErrorCode } from '../../shared/types'

const STATUS: Record<CommentsErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
}

/**
 * Domain-level error for the comments service layer. HTTP mapping lives
 * in `utils/http.ts` (API boundary) so the domain does not depend on h3.
 */
export class CommentsApiError extends Error {
  constructor(
    public readonly code: CommentsErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'CommentsApiError'
  }

  /** Resolved HTTP status for this error code. */
  get httpStatus(): number {
    return this.statusCode ?? STATUS[this.code]
  }
}

export function badRequest(msg: string): CommentsApiError {
  return new CommentsApiError('bad_request', msg)
}

export function unauthenticated(msg = 'authentication required'): CommentsApiError {
  return new CommentsApiError('unauthenticated', msg)
}

export function forbidden(msg = 'forbidden'): CommentsApiError {
  return new CommentsApiError('forbidden', msg)
}

export function notFound(msg = 'not found'): CommentsApiError {
  return new CommentsApiError('not_found', msg)
}

export function validationFailed(msg: string): CommentsApiError {
  return new CommentsApiError('validation_failed', msg)
}

export function rateLimited(msg = 'too many requests'): CommentsApiError {
  return new CommentsApiError('rate_limited', msg)
}

/** Wrap an unknown error as an internal 500, logging the original. */
export function internalError(err: unknown): CommentsApiError {
  console.error('[nuxt-comments] internal error:', err)
  return new CommentsApiError('internal', 'an unexpected error occurred')
}
