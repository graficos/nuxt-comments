/** Thrown when a resource exceeds the configured maximum length. */
export class ResourceLengthError extends Error {
  constructor(public readonly maxLength: number) {
    super(`resource must not exceed ${maxLength} characters`)
    this.name = 'ResourceLengthError'
  }
}

/**
 * Normalize a resource identifier for consistent storage and querying.
 *
 * Contract: the resource identifier is an opaque, non-empty string
 * (max `maxLength` chars, default 512). URL paths (`/blog/memorylessness`)
 * and namespaced ids (`blog:memorylessness`) are both valid; the system does
 * not assume a URL.
 *
 * Canonical form (documented in the README):
 *   - surrounding whitespace trimmed
 *   - leading slashes stripped (`/blog/x` and `blog/x` are the SAME
 *     resource — this guarantees the identifier round-trips through the
 *     `/api/_comments/:resource` URL without ambiguity)
 *   - repeated slashes collapsed
 *   - trailing slash removed
 *   - case preserved
 *
 * Throws `ResourceLengthError` when longer than `maxLength`; throws a plain
 * `Error`/`TypeError` for other invalid input (non-string, empty, or reduces
 * to an empty string such as `/`).
 */
export function normalizeResource(input: unknown, maxLength = 512): string {
  if (typeof input !== 'string') {
    throw new TypeError('resource must be a string')
  }
  let value = input.trim()
  if (value.length === 0) {
    throw new Error('resource must not be empty')
  }
  if (value.length > maxLength) {
    throw new ResourceLengthError(maxLength)
  }
  // Collapse repeated slashes.
  value = value.replace(/\/+/g, '/')
  // Strip leading slashes (URL-path syntax is redundant in canonical form).
  value = value.replace(/^\/+/, '')
  // Remove any trailing slash (non-root).
  if (value.endsWith('/')) {
    value = value.slice(0, -1)
  }
  if (value.length === 0) {
    throw new Error('resource must not be empty')
  }
  // `threads/` is reserved for comment-scoped API routes. Rejecting it
  // here keeps resource ids unambiguous with `/api/_comments/threads/...`.
  if (value === 'threads' || value.startsWith('threads/')) {
    throw new Error('resource must not use the reserved "threads/" prefix')
  }
  return value
}

/** Decode the `**:resource` route param into a normalized resource id. */
export function resourceFromParam(param: string | string[] | undefined, maxLength = 512): string {
  if (param === undefined) {
    throw new Error('resource is required')
  }
  const joined = Array.isArray(param) ? param.filter(Boolean).join('/') : param
  return normalizeResource(joined, maxLength)
}
