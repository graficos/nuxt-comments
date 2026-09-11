import { defineEventHandler, readBody, getHeader } from 'h3'
import { deleteCommentsUser } from '#comments/server'

/**
 * Playground-only admin route.
 *
 * The package ships NO unauthenticated HTTP endpoint for user deletion.
 * This route is owned by the playground and performs its own admin
 * authorization. In a real app you would use Better Auth's role checks
 * (e.g. `requireUserSession(event, { user: { role: 'admin' } })`).
 *
 * For the playground (which may run without a configured admin role),
 * we gate on a local admin token header to demonstrate the principle.
 */
export default defineEventHandler(async (event) => {
  const adminToken = getHeader(event, 'x-playground-admin-token')
  if (!adminToken || adminToken !== process.env.PLAYGROUND_ADMIN_TOKEN) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden', message: 'admin token required' })
  }

  const body = await readBody<{ userId?: string }>(event)
  if (!body?.userId) {
    throw createError({ statusCode: 422, statusMessage: 'validation_failed', message: 'userId is required' })
  }

  const result = await deleteCommentsUser(event, body.userId)
  return result
})
