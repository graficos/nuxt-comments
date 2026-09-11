import { describe, it, expect, vi } from 'vitest'
import { toH3Error } from '../../src/runtime/server/utils/http'
import { forbidden } from '../../src/runtime/server/utils/errors'

/**
 * Pins the public error envelope so it cannot silently drift from the
 * exported `CommentsError` type.
 */
describe('toH3Error', () => {
  it('maps a domain error to the documented h3 envelope', () => {
    const err = toH3Error(forbidden('you can only edit your own comments'))
    expect(err.statusCode).toBe(403)
    expect(err.statusMessage).toBe('forbidden')
    expect(err.message).toBe('you can only edit your own comments')
    expect(err.data).toEqual({
      code: 'forbidden',
      message: 'you can only edit your own comments',
    })
  })

  it('maps an unknown error to a generic 500 without leaking details', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = toH3Error(new Error('db down: secret connection string'))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()

    expect(err.statusCode).toBe(500)
    expect(err.data).toEqual({ code: 'internal', message: 'an unexpected error occurred' })
    expect(JSON.stringify(err.data)).not.toContain('db down')
    expect(err.message).not.toContain('db down')
  })
})
