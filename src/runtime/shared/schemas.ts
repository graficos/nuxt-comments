import {
  object, string, number, optional, pipe, maxLength, minLength, integer, minValue, maxValue, custom,
} from 'valibot'

export const resourceSchema = pipe(string(), minLength(1), maxLength(512))

export const createCommentSchema = object({
  body: pipe(string(), minLength(1), maxLength(4000)),
  parentId: optional(pipe(string(), minLength(1))),
})

export const updateCommentSchema = object({
  body: pipe(string(), minLength(1), maxLength(4000)),
})

export function createReactionSchema(allowedTypes: string[]) {
  return object({
    type: pipe(
      string(),
      minLength(1),
      custom(val => allowedTypes.includes(val as string), 'reaction type not allowed'),
    ),
  })
}

export const paginationSchema = object({
  limit: optional(pipe(number(), integer(), minValue(1), maxValue(100))),
  cursor: optional(string()),
})
