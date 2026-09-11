import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { resourceFromParam, ResourceLengthError } from '../../../shared/resource'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { badRequest, validationFailed } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const params = getRouterParams(event)
    const maxLength = useRuntimeConfig(event).public.comments?.limits?.maxResourceLength ?? 512
    let resource: string
    try {
      resource = resourceFromParam(params.resource, maxLength)
    }
    catch (err) {
      if (err instanceof ResourceLengthError) throw validationFailed('resource too long')
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
