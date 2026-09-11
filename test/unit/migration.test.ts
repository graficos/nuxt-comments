import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'

/**
 * Guards the initial schema's invariants. The migration is not deployed yet,
 * so these assert the shape directly rather than a diff.
 */
describe('initial schema', () => {
  it('declares NOT NULL primary keys on both tables', async () => {
    await expect(
      env.DB.prepare(
        'INSERT INTO comments (id, resource, user_id, body, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?)',
      ).bind('r', 'u', 'b', 't', 't').run(),
    ).rejects.toThrow(/NOT NULL/i)

    await expect(
      env.DB.prepare(
        'INSERT INTO comment_reactions (id, comment_id, user_id, type, created_at) VALUES (NULL, ?, ?, ?, ?)',
      ).bind('c', 'u', 'like', 't').run(),
    ).rejects.toThrow(/NOT NULL/i)
  })

  it('rejects a comment that has neither a body nor a deleted_at', async () => {
    await expect(
      env.DB.prepare(
        'INSERT INTO comments (id, resource, user_id, body, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
      ).bind('chk-1', 'r', 'u', 't', 't').run(),
    ).rejects.toThrow(/CHECK|constraint/i)
  })

  it('indexes the pagination tie-break and drops the redundant reaction index', async () => {
    const top = await env.DB.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_comments_resource_top'`,
    ).first<{ sql: string }>()
    expect(top!.sql).toContain('created_at, id')

    const replies = await env.DB.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_comments_replies'`,
    ).first<{ sql: string }>()
    expect(replies!.sql).toContain('created_at, id')

    const redundant = await env.DB.prepare(
      `SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = 'idx_reactions_comment'`,
    ).first()
    expect(redundant).toBeNull()
  })

  it('satisfies the top-level pagination sort from the index (no temp B-tree)', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT * FROM comments WHERE resource = ? AND parent_id IS NULL
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind('r', 21).all<{ detail: string }>()
    const plan = results.map(r => r.detail).join(' | ')
    expect(plan).not.toMatch(/TEMP B-TREE/i)
  })
})
