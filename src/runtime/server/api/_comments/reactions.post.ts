import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    const body = await readBody<{ type?: unknown }>(event)
    if (!body || typeof body !== 'object') throw validationFailed('request body is required')
    if (typeof body.type !== 'string') throw validationFailed('type is required')
    const service = useCommentsService(event)
    return await service.addReaction(commentId, body.type)
  }
  catch (err) {
    throw toH3Error(err)
  }
})
