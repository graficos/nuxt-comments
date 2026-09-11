---
title: D1 rejects statements with more than 100 bound parameters
date: 2026-09-12
category: database-issues
module: comments-d1-store
problem_type: database_issue
component: database
symptoms:
  - User deletion fails partway through once an account has more than ~100 comments
  - Loading reactions for a full page of comments fails for a signed-in viewer
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [d1, cloudflare, bound-parameters, batch, exists]
---

# D1 rejects statements with more than 100 bound parameters

## Problem

Cloudflare D1 caps a prepared statement at 100 bound parameters. Any query built by
expanding a JavaScript array into `IN (?, ?, ...)` has a parameter count that grows with the
data, so it works in tests with a handful of rows and fails in production on a full page or a
large account.

## Symptoms

- `deleteUserData` for a user with >100 comments throws a D1 error mid-deletion, leaving the
  account partially erased (reactions gone, comments half-deleted).
- `getUserReactions(userId, commentIds)` binds the viewer id plus one parameter per comment
  id; at the documented max page size of 100 that is 101 parameters and the request fails.
- Errors mention a bind/parameter problem rather than a SQL syntax problem, which makes it
  easy to misread as corrupt data.

## What Didn't Work

- Raising limits or validating input size. The limit is the platform's; the query shape is the
  bug, not the input.
- Wrapping the multi-statement deletion in a transaction without changing the `IN` lists. It
  makes failures atomic but still fails at the same size.
- Keeping the iterative leaf-delete loop. Each pass re-selected leaf ids and then bound them
  into `IN (...)`, so the same cap applied per iteration.

## Solution

Two shapes, both keeping the parameter count fixed regardless of row count.

**Reads — chunk the ids.** Chunk the array so no statement exceeds the cap. `getUserReactions`
uses one slot for `userId`, so its chunk is one smaller:

```ts
const D1_MAX_BOUND_PARAMS = 100

for (const ids of chunk(commentIds, D1_MAX_BOUND_PARAMS)) { /* listReactionsForComments */ }
for (const ids of chunk(commentIds, D1_MAX_BOUND_PARAMS - 1)) { /* getUserReactions */ }
```

**Writes/deletes — correlated predicates, then `batch()`.** Replace the id list with a
correlated `EXISTS` / `NOT EXISTS` so the statement has a constant parameter count, and run the
sequence in one `db.batch()` so it is atomic:

```ts
const [reactions, , preserved, removed] = await this.db.batch([
  this.db.prepare('DELETE FROM comment_reactions WHERE user_id = ?').bind(userId),
  this.db.prepare(
    `UPDATE comments SET body = NULL, deleted_at = ?, deleted_by = 'user-deletion', updated_at = ?
      WHERE user_id = ? AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = comments.id)`,
  ).bind(ts, ts, userId),
  this.db.prepare(
    `DELETE FROM comments
      WHERE user_id = ? AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = comments.id)`,
  ).bind(userId),
])
```

## Why This Works

The failure is a count, not a query plan: D1 refuses to prepare a statement whose bound
parameters exceed 100. Chunking bounds the count per statement and merging the results is
correct because the `WHERE` predicates are unchanged. The correlated predicates are strictly
better for writes because their parameter count is constant (1-2) no matter how many rows
match, and `batch()` gives atomicity the old sequence lacked — so a mid-sequence failure can
no longer leave a half-erased account.

## Prevention

- Never bind a list whose length tracks the data without chunking it. Prefer a correlated
  `EXISTS`/`NOT EXISTS` subquery when the list would be large.
- Add a test at the documented maximum (e.g. a page of 100 comments, a user with >100
  comments) — the bug is invisible at small fixtures.
- Keep multi-statement destructive operations inside `db.batch()` so size failures and
  partial failures are the same class of problem.

## Related Issues

- Route/API shape note: `docs/api.md`.
- Implementation: `src/runtime/server/repositories/d1-comments-store.ts`.
