import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const { commentId } = getRouterParams(event)
    if (typeof commentId !== 'string') throw validationFailed('commentId is required')
    const query = getQuery(event)
    const service = useCommentsService(event)
    return await service.listReplies(commentId, {
      cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    })
  }
  catch (err) {
    throw toH3Error(err)
  }
})
