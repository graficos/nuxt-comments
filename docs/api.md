# Server API

All routes live under the internal `/api/_comments` namespace so they cannot collide with application routes. The handlers are thin: they parse input, resolve the Better Auth session, and delegate to `CommentsService`.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/_comments/**:resource` | public | List top-level comments for a resource. |
| `POST` | `/api/_comments/**:resource` | required | Create a top-level comment. |
| `GET` | `/api/_comments/threads/:commentId/replies` | public | List replies for a comment. |
| `POST` | `/api/_comments/threads/:commentId/replies` | required | Create a reply. |
| `PATCH` | `/api/_comments/threads/:commentId` | required + owner | Edit your own comment. |
| `DELETE` | `/api/_comments/threads/:commentId` | required + owner | Delete your own comment. |
| `POST` | `/api/_comments/threads/:commentId/reactions` | required | Add a reaction `{ type }`. |
| `DELETE` | `/api/_comments/threads/:commentId/reactions/:type` | required | Remove your reaction of a type. |

### Why `threads/`?

Resource identifiers are opaque and may contain slashes. If comment operations lived directly at `/api/_comments/:commentId`, a resource such as `blog/reactions` would be ambiguous with "a reaction on comment `blog`". Comment-scoped operations therefore live under the reserved `threads/` prefix, and `normalizeResource` rejects resources beginning with `threads/`. This keeps `/api/_comments/blog/reactions` unambiguously a resource.

### Create a comment

```http
POST /api/_comments/blog/my-post
Content-Type: application/json

{ "body": "Plain text, line breaks preserved." }
```

Response `200`:

```json
{
  "id": "01JB...",
  "resource": "blog/my-post",
  "userId": "better-auth-user-id",
  "parentId": null,
  "body": "Plain text, line breaks preserved.",
  "authorName": "Ada",
  "authorImage": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "deletedAt": null,
  "deletedBy": null
}
```

Bodies are stored as original plain text, never rendered HTML. The package never uses `v-html` on user content.

### List comments

```http
GET /api/_comments/blog/my-post?limit=20&cursor=<opaque>
```

```json
{
  "items": [ /* comments with reactionCounts and viewerReactions */ ],
  "nextCursor": "eyJjcmVhdGVkQXQiOiI...",
  "hasMore": true
}
```

Top-level comments only. Replies are fetched separately from `/threads/:commentId/replies`, so opening a post never loads the entire discussion.

## Pagination

- **Cursor-based.** Pass the previous response's `nextCursor` back as `?cursor=`. The cursor is an opaque base64 token; do not construct or parse it.
- `limit` is optional and clamped to `[1, pagination.maxPageSize]`. Values above the cap are clamped, not rejected.
- `nextCursor` is `null` (and `hasMore` is `false`) when there are no more pages.
- Top-level comments and replies paginate independently.
- Ordering is newest-first (`createdAt` descending, `id` descending as a tie-breaker).

## Validation

Shared Valibot schemas (`src/runtime/shared/schemas.ts`) validate all input. The service additionally enforces:

- the resource normalizes to a non-empty string ≤ `limits.maxResourceLength` and is not the reserved `threads/` prefix;
- bodies are non-empty and ≤ `limits.maxBodyLength`;
- a reply's parent exists, belongs to the **same resource**, and is not deleted — replies cannot be attached across resources;
- reaction types are in `reactions.types` and reactions disabled returns `bad_request`;
- edits and deletes require ownership;
- pagination values are integers within bounds.

## Errors

Errors use h3's envelope, with the package's code in `data`:

```json
{
  "statusCode": 403,
  "statusMessage": "forbidden",
  "message": "you can only edit your own comments",
  "data": { "code": "forbidden", "message": "you can only edit your own comments" }
}
```

| Status | `data.code` | When |
|---|---|---|
| `400` | `bad_request` | Malformed request, invalid resource, parent/resource mismatch, reactions disabled, replying to a deleted comment. |
| `401` | `unauthenticated` | Mutation without a session. |
| `403` | `forbidden` | Editing/deleting another user's comment. |
| `404` | `not_found` | Comment or parent not found. |
| `409` | `conflict` | Reserved for conflicting state. |
| `422` | `validation_failed` | Schema/limit/reaction-type failures. |
| `429` | `rate_limited` | Mutation rate limit exceeded. |
| `500` | `internal` | Unexpected error. Original error is logged server-side; no database details leak to clients. |

Client code reads the code via `error.data.code` (the outer object is h3's envelope, `data` is the package payload).

## Rate limiting

The service calls an abuse-prevention extension point before every mutation, with scopes `comments:create`, `comments:reply`, `comments:update`, `comments:delete`, `comments:react`.

- `rateLimiter: 'memory'` (default) uses an in-memory limiter (30 mutations/minute per IP). **It is per-isolate and not suitable for multi-isolate production.** The client IP comes from `cf-connecting-ip`; `x-forwarded-for` is only used when `rateLimiterTrustProxy` is enabled behind a trusted proxy.
- `rateLimiter: 'none'` disables it.

For production, implement the `RateLimiter` port with Cloudflare-native rate limiting (WAF rules or the Workers Rate Limiting binding) — the domain never depends on the limiter implementation. See [adapters.md](./adapters.md).

## Deletion policy

Deletion is deliberate and documented. Permanent destruction only happens where the policy says so.

| Trigger | Behavior |
|---|---|
| Author deletes own comment **with replies** | **Soft-delete**: `body` is set to `NULL`, `deleted_at`/`deleted_by='author'` are set, and reactions on it are removed. The row remains as a `[deleted]` tombstone so the thread survives. The author snapshot is retained until account deletion. |
| Author deletes own comment **without replies** | **Hard-delete**: the row is removed. Reactions cascade via the foreign key. |
| Admin `deleteCommentsUser(userId)` | Clears `author_name`/`author_image` on **every** comment the user owns (including comments the user had already soft-deleted), hard-deletes **all** of the user's reactions, **hard-deletes** the user's comments that have no replies, and **soft-deletes** the user's comments that have replies (`deleted_by='user-deletion'`). Returns `{ comments, reactions }` counts; `comments` is rows hard-deleted plus rows soft-deleted by this call. |

No display name or avatar survives account deletion, regardless of the comment's prior delete state.

Admin user deletion is a **server-only utility**, not an HTTP endpoint:

```ts
import { deleteCommentsUser } from '#comments/server'

export default defineEventHandler(async (event) => {
  await requireUserSession(event, { user: { role: 'admin' } })
  return deleteCommentsUser(event, userId)
})
```

Never expose it without your own authorization check.
