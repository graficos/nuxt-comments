import type { CommentsMessages } from './runtime/shared/messages'

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
  auth?: {
    database?: {
      /**
       * D1 binding holding Better Auth's tables (user/session/account/verification).
       * Setting this enables D1-backed Better Auth; omit it to leave Better Auth
       * on its own (in-memory) default. Must match a binding in your Wrangler file.
       */
      binding?: string
    }
  }
  /**
   * Override any component string (including `aria-label`s) for i18n.
   * Merged over the built-in English defaults. Dynamic parts use `{token}`
   * placeholders, e.g. `replyTo: 'Antwort an {author}…'`.
   */
  messages?: Partial<CommentsMessages>
  /** Rate limiter strategy. 'memory' is single-isolate only. @default 'memory' */
  rateLimiter?: 'none' | 'memory'
  /**
   * Trust `x-forwarded-for` for rate-limit identity. Enable only when the
   * app runs behind a trusted proxy; otherwise `cf-connecting-ip` is used.
   * @default false
   */
  rateLimiterTrustProxy?: boolean
}

export interface RuntimeConfigComments {
  databaseBinding: string
  rateLimiter: 'none' | 'memory'
  rateLimiterTrustProxy: boolean
}

export interface RuntimeConfigPublicComments {
  pagination: Required<NonNullable<NonNullable<ModuleOptions['pagination']>>>
  reactions: Required<NonNullable<NonNullable<ModuleOptions['reactions']>>>
  limits: Required<NonNullable<NonNullable<ModuleOptions['limits']>>>
  componentsPrefix: string
  messages: CommentsMessages
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
