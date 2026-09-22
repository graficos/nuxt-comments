import { defineEventHandler, getRouterParams } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

/**
 * Erase a user's personally identifiable data from the comments domain.
 *
 * Authorization (enforced in the service, from the server session only): the
 * caller may erase their own data, or a moderator whose session role matches
 * `comments.auth.adminRole`. This is a low-level primitive: deleting the
 * Better Auth user/session/account rows is the consumer's responsibility.
 * See docs/privacy.md.
 */
export default defineEventHandler(async (event) => {
  try {
    const { userId } = getRouterParams(event)
    if (typeof userId !== 'string' || userId.length === 0) throw validationFailed('userId is required')
    if (userId.length > 255) throw validationFailed('userId is too long')
    const service = useCommentsService(event)
    const result = await service.deleteUserData(userId)
    return { success: true, ...result }
  }
  catch (err) {
    throw toH3Error(err)
  }
})
