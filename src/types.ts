export interface ModuleOptions {
  database?: {
    /** D1 binding name configured in the consumer's Wrangler file. @default 'DB' */
    binding?: string
  }
  pagination?: {
    /** Default page size for list endpoints. @default 20 */
    pageSize?: number
    /** Maximum allowed limit value. @default 100 */
    maxPageSize?: number
  }
  reactions?: {
    /** Enable reactions. @default true */
    enabled?: boolean
    /** Allowed reaction type strings. @default ['like'] */
    types?: string[]
  }
  limits?: {
    /** Maximum comment body length. @default 4000 */
    maxBodyLength?: number
    /** Maximum resource identifier length. @default 512 */
    maxResourceLength?: number
  }
  components?: {
    /** Prefix for exposed components. Set to '' for <Comments>. @default 'Nuxt' */
    prefix?: string
  }
  softDelete?: {
    /** Preserve a [deleted] placeholder when a comment with replies is deleted. @default true */
    preserveThreadsWithReplies?: boolean
  }
  /** Rate limiter strategy. 'memory' is single-isolate only. @default 'memory' */
  rateLimiter?: 'none' | 'memory'
}

export interface RuntimeConfigComments {
  databaseBinding: string
  rateLimiter: 'none' | 'memory'
}

export interface RuntimeConfigPublicComments {
  pagination: Required<NonNullable<NonNullable<ModuleOptions['pagination']>>>
  reactions: Required<NonNullable<NonNullable<ModuleOptions['reactions']>>>
  limits: Required<NonNullable<NonNullable<ModuleOptions['limits']>>>
  softDelete: Required<NonNullable<NonNullable<ModuleOptions['softDelete']>>>
  componentsPrefix: string
}

declare module 'nuxt/schema' {
  interface RuntimeConfig {
    comments?: RuntimeConfigComments
  }
  interface PublicRuntimeConfig {
    comments?: RuntimeConfigPublicComments
  }
}

declare module '@nuxt/kit' {
  interface NuxtOptions {
    comments?: ModuleOptions
  }
}
