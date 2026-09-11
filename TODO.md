# Production-Readiness TODO — nuxt-comments

Source: `ce-code-review` run `20260911-144624-b69bae9a` (2026-09-11), reviewing the full working tree
(zero-commit repo at the time). Finding numbers below (`#N`) refer to that report.

**Status legend:** `ready-for-agent` = no unfinished blockers. `done` = already resolved.
**Priority** reflects review severity, not execution order — execution order is the blocking edges.

> **Already resolved:** the review's P0 (`#1` — live Better Auth session token in `cookies.txt`) has been
> purged from git history, deleted from the tree, and added to `.gitignore`. Secret rotation still needs
> confirming as an operational step, not a code ticket.

Work the frontier: any ticket whose blockers are all done.

---

## 01. Make user-data deletion atomic and parameter-safe

**Priority:** P1 (review `#2`)

**What to build:** Deleting a user's comments-domain data must complete fully or not at all, and must work
for a user with hundreds of comments. Today the deletion runs disconnected statements and builds `IN (...)`
lists that exceed Cloudflare D1's 100-bound-parameter cap, so a large account fails partway through and is
left half-erased.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `deleteUserData` no longer sends more than 100 bound parameters in any single statement (chunk ids, or
      use the `EXISTS`/`NOT EXISTS` correlated predicates the surrounding SELECTs already use).
- [x] The reaction cleanup and comment soft-delete happen in one atomic `batch()`, so a mid-sequence failure
      cannot produce a partially erased account.
- [x] A test deletes a user with more than 100 comments and more than 100 reply-parented comments and
      asserts every comment/reaction is in the intended terminal state.
- [x] The returned counts match what was actually removed.

> **Done:** All three statements now run in one `db.batch()` with fixed parameter counts (1-3 each) and no
> `IN` lists; the soft-delete pass collapses the old leaf loop into a single correlated `DELETE`. Counts come
> from `meta.changes`. New test seeds 120 thread parents + 120 leaves + 150 reactions and asserts exact
> counts and terminal states. Workers suite 61 pass, node suite 41 pass, lint and typecheck clean.

---

## 02. Correct account-deletion PII policy

**Priority:** P1 (review `#6`)

**What to build:** After a user is deleted, no author name or avatar from that user survives anywhere —
including comments the user had already soft-deleted before the account deletion. Today only
`deleted_at IS NULL` comments get their author snapshots nulled.

**Blocked by:** 01 (same deletion path; do the structural fix first).

**Status:** done

- [x] Author name/image are cleared for every comment owned by the user, regardless of prior delete state.
- [x] A test seeds a user with an author-soft-deleted comment and asserts the snapshot is null after
      `deleteCommentsUser`.
- [x] The behavior is stated in the deletion-policy docs.

> **Done:** Added an unconditional `UPDATE comments SET author_name = NULL, author_image = NULL WHERE
> user_id = ?` as the second statement of the deletion batch, so snapshots are scrubbed even for rows
> already soft-deleted. Existing tombstone metadata (`deleted_at`/`deleted_by`) is preserved. Admin API
> test seeds an author-soft-deleted thread parent and asserts both snapshots are null afterward. Docs
> updated in `docs/api.md` and the `deleteCommentsUser` JSDoc. Workers suite 62 pass, lint and typecheck
> clean.

---

## 03. Bound reaction reads under D1's parameter cap

**Priority:** P1 (review `#4`)

**What to build:** Loading the reactions for a full page of comments must not fail. Today the viewer-reaction
query binds the viewer id plus one parameter per comment id; at the documented max page size of 100 that is
101 parameters, over D1's limit, so the request errors for any signed-in viewer at max page size.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Reaction lookups never exceed 100 bound parameters (chunk to <= 99 and merge, or aggregate in SQL).
- [x] A test fetches a page of 100 comments as an authenticated viewer and asserts 200 with correct
      `reactionCounts` / `viewerReactions`.
- [x] Pagination still clamps `limit` to the configured maximum.

> **Done:** `listReactionsForComments` chunks ids by 100 and `getUserReactions` by 99 (the viewer id takes
> one slot), merging results. New store test seeds 100 comments + 100 reactions and asserts both readers
> return all 100 (previously `getUserReactions` bound 101 params). Workers suite 63 pass.

---

## 04. Tighten the initial schema

**Priority:** P2 (review `#25`, `#11`, `#26`)

**What to build:** The initial migration should be unambiguous and index the queries the code actually runs:
primary keys should be declared `NOT NULL`, the comment indexes should include the `id` tie-break so the
`ORDER BY created_at DESC, id DESC` is fully index-satisfied, and the redundant reaction index should go.

**Blocked by:** None (schema is not deployed yet; safe to edit in place).

**Status:** done

- [x] Both `id` columns are `TEXT PRIMARY KEY NOT NULL`.
- [x] The top-level and reply indexes include `id`; a query-plan check shows no temp B-tree for the
      pagination sorts.
- [x] The duplicate `comment_id`-only reaction index is removed; the UNIQUE index still serves those lookups.
- [x] A test asserts the `CHECK (body OR deleted_at)` invariant rejects a row with both null.

> **Done:** `id TEXT PRIMARY KEY NOT NULL` on both tables; `idx_comments_resource_top` and
> `idx_comments_replies` extended with `id`; `idx_reactions_comment` dropped (UNIQUE prefix covers it). New
> `test/unit/migration.test.ts` asserts NOT NULL PKs, the CHECK invariant, index shape, and a query plan with
> no TEMP B-TREE. Workers suite 67 pass.

---

## 05. Fix the public error contract

**Priority:** P1 (review `#3`)

**What to build:** The exported error type must describe the error the API actually returns. Today the
published `CommentsError` says `{ error: { code, message } }`, while the API emits the h3 envelope
`{ statusCode, statusMessage, message, data: { code, message } }`. Consumers typing against the package get
the wrong shape.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The exported error type matches the emitted envelope, or is removed if it is not a supported surface.
- [x] The `toH3Error` doc comment matches the emitted shape.
- [x] A test pins the envelope shape (status code, `data.code`) for at least one domain error and the
      unknown-error 500 path.
- [x] `docs/api.md` shows the same envelope.

> **Done:** `CommentsError` now declares `{ statusCode, statusMessage, message, data: { code, message } }`;
> the `toH3Error` JSDoc and the `docs/api.md` client-access line were corrected to `error.data.code`. New
> `test/unit/http.test.ts` pins both the domain-error envelope and the non-leaking 500. Workers suite 69 pass.

---

## 06. Harden store write/delete error handling and races

**Priority:** P2 (review `#18`, `#19`, `#20`)

**What to build:** A committed write must never surface as a generic 500, a comment deletion racing a new
reply must not blow up as an FK error, and duplicate reactions must not depend on SQLite's error string.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `createComment` / `updateComment` do not throw a generic error after the write succeeded (return the
      built row, or use `RETURNING`).
- [x] Deleting a comment with a concurrently inserted reply degrades to soft-delete instead of a 500
      (conditional delete + fallback).
- [x] Duplicate reactions are handled with `ON CONFLICT ... DO NOTHING` (or equivalent) rather than matching
      an error-message substring.
- [x] Tests cover each of the three behaviors.

> **Done:** `createComment` builds its return value from known input (no read-back); `updateComment` uses
> `UPDATE ... RETURNING *`; `deleteComment` uses a single conditional `DELETE ... AND NOT EXISTS (child)` with
> a soft-delete fallback; `addReaction` uses `ON CONFLICT(comment_id, user_id, type) DO NOTHING` then selects.
> Existing soft-delete/duplicate tests cover the fallback and idempotency; new tests cover clean update
> rejection and unknown-id delete. Workers suite 71 pass.

---

## 07. Harden session resolution and rate limiting

**Priority:** P2 (review `#21`, `#22`, plus the `x-forwarded-for` residual)

**What to build:** An auth-backend failure must be observable, not silently identical to "anonymous", and the
default in-memory rate limiter must not grow without bound or trust a spoofable forwarded header by default.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `getViewer` logs the failure before returning anonymous; only the known "module unavailable" case
      degrades silently.
- [x] The in-memory limiter evicts expired buckets once it passes a size cap.
- [x] The client-IP source is documented and only trusts a forwarded header behind a configured trusted
      proxy; `cf-connecting-ip` is preferred.
- [x] Tests cover the limiter boundary (allow N, reject N+1, window reset) and the IP-selection policy.

> **Done:** `getViewer` now logs the caught error before returning anonymous. `InMemoryRateLimiter` gained a
> bounded key map (expired-then-oldest eviction) and an explicit `trustProxy` option; `resolveClientIp`
> prefers `cf-connecting-ip` and only reads `x-forwarded-for` when trusted. Added the `rateLimiterTrustProxy`
> module option, wired through runtime config, plus `test/unit/rate-limiter.test.ts` (boundary + IP policy).
> Workers suite 78 pass.

---

## 08. Single-source the resource length limit

**Priority:** P2 (review `#23`)

**What to build:** The resource identifier length should be enforced in one place, and the configured limit
should actually be reachable. Today a hardcoded 512 cap (400) shadows the configured `maxResourceLength`
(422), so raising the option above 512 does nothing and the status code depends on which check fires.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The configured limit is the only length check, and an over-length resource returns the documented
      status.
- [x] A test with `maxResourceLength` above 512 accepts a longer id; a test at the boundary rejects.
- [x] The option is documented accurately.

> **Done:** `normalizeResource`/`resourceFromParam` take an optional `maxLength` and throw a dedicated
> `ResourceLengthError`; the service and both resource handlers pass `limits.maxResourceLength` and map the
> length error to `validation_failed` (422) instead of a hardcoded 512 -> 400. Tests cover a 600-char limit
> (previously unreachable) at service and unit level. Workers suite 82 pass.

---

## 09. Decide and enforce `preserveThreadsWithReplies`

**Priority:** P2 (review `#10`) — **human decision gate**

**What to build:** The `softDelete.preserveThreadsWithReplies` option is read into config but never
consulted, so setting it to `false` is a silent no-op. Either implement the behavior or remove the option
from the public surface and docs.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A decision is recorded: implement the `false` branch, or remove the option.
- [ ] If implemented: deleting a comment with replies either preserves the thread (default) or removes the
      subtree, and a test proves the non-default path.
- [ ] If removed: the option, its default, and all docs references are gone.
- [ ] No dead config field remains either way.

---

## 10. Frontend: async-state integrity in `useComments`

**Priority:** P1 (review `#5`, `#17`)

**What to build:** Switching resources quickly must show the newest resource's comments, and toggling a
thread twice must not append the same replies twice. Today there is no request-generation guard on the main
load and no in-flight guard on reply loading, and thread state is not reset when the resource changes.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A slow in-flight load cannot overwrite a newer load's comments/cursor/hasMore.
- [ ] `loadReplies` is not entered twice concurrently for the same comment.
- [ ] Reply/expansion state resets when the resource changes.
- [ ] Tests cover a rapid resource switch (later resource wins) and a double toggle (single append).

---

## 11. Frontend: correct reply ownership and slot forwarding

**Priority:** P2 (review `#7`, `#29`)

**What to build:** A reply must be editable/deletable based on its own author, not the parent comment's. And
named slots provided to the top-level comments component should reach nested replies.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Edit/delete affordances are computed per comment, including replies.
- [ ] Custom slots forward through the recursive comment rendering.
- [ ] A test asserts a reply authored by another user shows no edit control, and that a custom slot renders
      for a nested reply.
- [ ] Docs for the component match the actual slot behavior.

---

## 12. Frontend: composer and reaction interaction safety

**Priority:** P2 (review `#12`, `#13`, `#14`, `#15`, `#16`)

**What to build:** Actions must be re-entrancy-safe and leave the UI consistent: no double submit, replies
posted into an open thread must appear exactly once, a rapid react/unreact must end in the intended state,
reacting to a reply must update that reply's counts, and a failed mutation must surface an error instead of
disappearing.

**Blocked by:** 10 (composable state guards/helpers), 11 (per-comment ownership predicate).

**Status:** ready-for-agent

- [ ] The composer blocks a second in-flight submit and resets its state afterward.
- [ ] Posting into an expanded thread prepends the created reply instead of refetching/duplicating.
- [ ] Reaction toggles use optimistic/current state so a fast double-click resolves correctly.
- [ ] Reacting to a nested reply refreshes that reply's counts and active state.
- [ ] Mutation failures set the error state and fire the documented error event.
- [ ] Tests cover each behavior.

---

## 13. Delete dead code, unused dependency, and stale docs

**Priority:** P2/P3 (review `#8`, `#9`, `#27`, `#28`, plus the unused `conflict()` helper)

**What to build:** Remove the unused validation module and the `valibot` dependency (or wire it in), delete the
unused auth exports and the `AuthorResolver` port until something consumes them, fix the README doc links
that break in the published tarball, and drop the never-thrown `conflict` error surface.

**Blocked by:** 09 (removing the `preserveThreadsWithReplies` option may touch the same docs surface).

**Status:** ready-for-agent

- [ ] Nothing in the package imports the removed symbols; lint and the published build are clean.
- [ ] `valibot` is either used at the boundary or removed from dependencies and the lockfile.
- [ ] README links resolve in the packed tarball (ship `docs`, or use absolute URLs).
- [ ] Docs no longer claim validation or options that do not exist.

---

## 14. Backend/D1 test coverage for the fixed behavior

**Priority:** P2 (review testing gaps; supports `#2`, `#4`, `#6`, `#18`, `#19`)

**What to build:** Lock in the backend fixes with the tests that would have caught them: the max-page and
large-deletion boundary cases, deletion-policy/PII behavior, migration constraints, and the error/race paths.

**Blocked by:** 01, 02, 03, 04, 06.

**Status:** ready-for-agent

- [ ] Tests exist for the 100-parameter boundaries, large `deleteUserData`, and PII scrubbing.
- [ ] Tests assert the migration `CHECK`, `NOT NULL` PKs, FK enforcement/cascade, and query-plan/index use.
- [ ] Tests cover the reply-during-delete race and duplicate-reaction path.
- [ ] The suite fails if any of the above regresses.

---

## 15. Frontend test coverage for the composable and interaction fixes

**Priority:** P2 (review `#24`; supports 10-12)

**What to build:** The real `useComments` composable and the interaction fixes need tests; today the only test
that touches it mocks it out, so path building, pagination append/reset, error handling, and the race guards
are unverified.

**Blocked by:** 10, 11, 12.

**Status:** ready-for-agent

- [ ] The real composable is tested (resource path building, append vs reset, error on rejected request).
- [ ] The race/re-entrancy guards have tests (stale load, double toggle, double submit, rapid react).
- [ ] Reply ownership and slot forwarding are covered.

---

## 16. Production-readiness verification

**Priority:** P1

**What to build:** A final gate proving the module is safe to ship: no secrets or session artifacts in the
tree or history, all fixes landed, and the full local gate suite is green on a clean checkout.

**Blocked by:** 01-15 (all preceding tickets).

**Status:** ready-for-agent

- [ ] `git log --all -- cookies.txt` and equivalent secret scans are empty.
- [ ] `NUXT_BETTER_AUTH_SECRET` has been rotated (operational confirmation).
- [ ] Lint, both test suites, typecheck, and the production package build all pass.
- [ ] A fresh consumer app installs the packed tarball and completes a real sign-in -> comment -> reply ->
      reaction flow.
- [ ] The published tarball contains only intended files (no `.opencode`, `.vscode`, generated worker types,
      or local env files).

---

## Dependencies at a glance

```
01 --> 02
03    (independent)
04    (independent)
05    (independent)
06    (independent)
07    (independent)
08    (independent)
09 --> 13
10 --> 12
11 --> 12
01,02,03,04,06 --> 14
10,11,12 --> 15
01..15 --> 16
```

Frontier (can start now): 01, 03, 04, 05, 06, 07, 08, 09, 10, 11.
