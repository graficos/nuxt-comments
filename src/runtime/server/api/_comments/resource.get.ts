import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { resourceFromParam } from '../../../shared/resource'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { badRequest } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const params = getRouterParams(event)
    let resource: string
    try {
      resource = resourceFromParam(params.resource)
    }
    catch {
      throw badRequest('invalid resource identifier')
    }
    const query = getQuery(event)
    const service = useCommentsService(event)
    return await service.listTopLevel(resource, {
      cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    })
  }
  catch (err) {
    throw toH3Error(err)
  }
})
