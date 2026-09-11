import { defineEventHandler, getRouterParams } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId, type } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    if (typeof type !== 'string') throw validationFailed('type is required')
    const service = useCommentsService(event)
    await service.removeReaction(commentId, type)
    return { success: true }
  }
  catch (err) {
    throw toH3Error(err)
  }
})
