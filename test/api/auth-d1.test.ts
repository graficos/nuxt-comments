import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'

// The opt-in provider hands Better Auth the raw D1 binding; Better Auth then
// builds its bundled Kysely D1 dialect. These tests run Better Auth against
// the real Miniflare D1 with the shipped `migrations/auth` schema, proving the
// DDL matches the adapter.
function createAuth() {
  return betterAuth({
    secret: 'test-secret-2f8Qm1ZpXr7Lk4Vn9Bc3Ds6Gh0Jt5WyA',
    baseURL: 'http://test.local',
    // Same value the generated `createDatabase(event)` returns.
    database: env.DB,
    emailAndPassword: { enabled: true },
  })
}

describe('Better Auth on D1', () => {
  it('persists user, account and session for email/password', async () => {
    const auth = createAuth()
    const email = `d1-${Date.now()}@example.com`
    const password = 'password12345'

    await auth.api.signUpEmail({ body: { email, password, name: 'D1 User' } })

    const user = await env.DB
      .prepare('SELECT id, email, emailVerified FROM user WHERE email = ?')
      .bind(email)
      .first<{ id: string, email: string, emailVerified: number }>()
    expect(user?.email).toBe(email)
    expect(user?.id).toBeTruthy()
    expect(user?.emailVerified).toBe(0)

    const account = await env.DB
      .prepare('SELECT providerId, password FROM account WHERE userId = ?')
      .bind(user!.id)
      .first<{ providerId: string, password: string | null }>()
    expect(account?.providerId).toBe('credential')
    expect(account?.password).toBeTruthy()

    const signIn = await auth.api.signInEmail({ body: { email, password } })
    expect(signIn.user.id).toBe(user!.id)

    const session = await env.DB
      .prepare('SELECT token, userId FROM session WHERE token = ?')
      .bind(signIn.token)
      .first<{ token: string, userId: string }>()
    expect(session?.userId).toBe(user!.id)
  })

  it('keeps the auth tables in the same D1 database as comments', async () => {
    const tables = await env.DB
      .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name')
      .all<{ name: string }>()
    const names = tables.results.map(row => row.name)
    expect(names).toEqual(expect.arrayContaining(['user', 'session', 'account', 'verification', 'comments', 'comment_reactions']))
  })
})
