import type { APIRequestContext, Cookie, Playwright } from '@playwright/test'
import { randomUUID } from 'node:crypto'

/** Shared test-only constants. `ADMIN_TOKEN` must match the webServer env. */
export const ADMIN_TOKEN = 'e2e-admin-token'
export const TEST_SECRET = 'e2e-only-secret-not-used-in-production-0123456789'

export interface CreatedComment {
  id: string
}

export interface TestUser {
  id: string
  email: string
  name: string
  /** Session cookies, ready for `context.addCookies()`. */
  cookies: Cookie[]
  /** Request context authenticated as this user (holds the session cookie). */
  request: APIRequestContext
}

const PASSWORD = 'password12345'
const API = '/api/_comments'

/** A resource id unique to a single test, so tests never share comments. */
export function uniqueResource(prefix = 'blog'): string {
  return `/${prefix}/e2e-${randomUUID()}`
}

async function expectOk(res: { ok(): boolean, status(): number, text(): Promise<string> }) {
  if (!res.ok()) throw new Error(`request failed (${res.status()}): ${await res.text()}`)
}

/**
 * Create a real Better Auth user (and session) through the public sign-up API.
 * The playground's login UI is social-only, so this is how e2e gets a session;
 * the cookie is then injected into a browser context.
 */
export async function createUser(playwright: Playwright, baseURL: string | undefined): Promise<TestUser> {
  const request = await playwright.request.newContext({ baseURL })
  const email = `e2e-${randomUUID()}@example.com`
  const name = 'E2E User'
  const res = await request.post('/api/auth/sign-up/email', {
    data: { email, password: PASSWORD, name },
  })
  await expectOk(res)
  const body = (await res.json()) as { user: { id: string } }
  const state = await request.storageState()
  return { id: body.user.id, email, name, cookies: state.cookies, request }
}

export async function createComment(user: TestUser, resource: string, body: string): Promise<CreatedComment> {
  const res = await user.request.post(`${API}${resource}`, { data: { body } })
  await expectOk(res)
  return (await res.json()) as CreatedComment
}

export async function createReply(user: TestUser, parentId: string, body: string): Promise<CreatedComment> {
  const res = await user.request.post(`${API}/threads/${parentId}/replies`, { data: { body } })
  await expectOk(res)
  return (await res.json()) as CreatedComment
}

export async function addReaction(user: TestUser, commentId: string, type: string): Promise<void> {
  const res = await user.request.post(`${API}/threads/${commentId}/reactions`, { data: { type } })
  await expectOk(res)
}

/** Fetch a page's raw HTML (no JS), optionally with a session cookie. */
export async function fetchHtml(
  playwright: Playwright,
  baseURL: string | undefined,
  path: string,
  cookies?: Cookie[],
): Promise<string> {
  const context = await playwright.request.newContext({
    baseURL,
    storageState: cookies ? { cookies, origins: [] } : undefined,
  })
  try {
    const res = await context.get(path)
    await expectOk(res)
    return await res.text()
  }
  finally {
    await context.dispose()
  }
}
