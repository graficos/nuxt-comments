import { defineEventHandler, getQuery, getRouterParams } from 'h3'
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
