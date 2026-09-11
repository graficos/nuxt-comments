import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    const body = await readBody<{ body?: unknown }>(event)
    if (!body || typeof body !== 'object') throw validationFailed('request body is required')
    const service = useCommentsService(event)
    return await service.updateComment(commentId, typeof body.body === 'string' ? body.body : '')
  }
  catch (err) {
    throw toH3Error(err)
  }
})
