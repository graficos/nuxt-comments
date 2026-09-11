import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed, notFound } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    const body = await readBody<{ body?: unknown }>(event)
    if (!body || typeof body !== 'object') throw validationFailed('request body is required')

    const service = useCommentsService(event)
    // The reply's resource is derived from the parent comment, never from
    // the request — replies cannot be attached across resources.
    const parent = await service.getComment(commentId)
    if (!parent) throw notFound('parent comment not found')

    return await service.createComment({
      resource: parent.resource,
      body: typeof body.body === 'string' ? body.body : '',
      parentId: commentId,
    })
  }
  catch (err) {
    throw toH3Error(err)
  }
})
