import { defineEventHandler, getRouterParams } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    const service = useCommentsService(event)
    await service.deleteComment(commentId)
    return { success: true }
  }
  catch (err) {
    throw toH3Error(err)
  }
})
