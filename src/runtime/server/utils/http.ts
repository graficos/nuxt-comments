import { createError, type H3Error } from 'h3'
import { CommentsApiError, internalError } from './errors'

function toH3(code: string, status: number, message: string): H3Error {
  return createError({
    statusCode: status,
    statusMessage: code,
    message,
    data: { code, message },
  })
}

/**
 * Map a `CommentsApiError` to an h3 error with the consistent public
 * envelope `{ statusCode, statusMessage, message, data: { code, message } }`.
 * Unknown errors are logged and surfaced as a generic 500 (no internal
 * details leak to clients).
 *
 * This lives at the API boundary; the domain layer never imports h3.
 */
export function toH3Error(err: unknown): H3Error {
  if (err instanceof CommentsApiError) {
    return toH3(err.code, err.httpStatus, err.message)
  }
  const internal = internalError(err)
  return toH3(internal.code, internal.httpStatus, internal.message)
}
