import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { resourceFromParam } from '../../../shared/resource'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { badRequest, validationFailed } from '../../utils/errors'

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
    const body = await readBody<{ body?: unknown, parentId?: unknown }>(event)
    if (!body || typeof body !== 'object') {
      throw validationFailed('request body is required')
    }
    const service = useCommentsService(event)
    return await service.createComment({
      resource,
      body: typeof body.body === 'string' ? body.body : '',
      parentId: typeof body.parentId === 'string' ? body.parentId : null,
    })
  }
  catch (err) {
    throw toH3Error(err)
  }
})
