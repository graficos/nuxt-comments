import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { useCommentsService } from '../../services/index'
import { toH3Error } from '../../utils/http'
import { validationFailed } from '../../utils/errors'

/**
 * Batch reaction summaries for a set of comment ids (`?ids=a,b,c`).
 *
 * Reactions are deliberately not embedded in the content endpoints, so the
 * comment list can be server-rendered and cached while per-viewer reaction
 * state hydrates on the client.
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const raw = query.ids
    if (typeof raw !== 'string') throw validationFailed('ids is required')
    const ids = [...new Set(raw.split(',').map(id => id.trim()).filter(Boolean))]
    if (ids.length === 0) return { items: [] }
    const maxIds = useRuntimeConfig(event).public.comments?.pagination?.maxPageSize ?? 100
    if (ids.length > maxIds) throw validationFailed(`too many ids (max ${maxIds})`)
    const service = useCommentsService(event)
    return { items: await service.listReactionSummaries(ids) }
  }
  catch (err) {
    throw toH3Error(err)
  }
})
