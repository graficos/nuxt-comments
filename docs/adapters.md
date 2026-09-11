# Adapter architecture

The domain and API layers never talk to D1 directly. They depend on a small interface, `CommentsStore`, and the shipped `D1CommentsStore` implements it. This boundary is what makes an alternative backend (or a mirror) possible without touching the API, services, composables, or components.

```text
Comments domain / CommentsService
              │
              ▼
        CommentsStore          (interface — the boundary)
              │
              ▼
        D1CommentsStore        (MVP implementation)
              │
              ▼
         Cloudflare D1
```

## `CommentsStore`

```ts
export interface CommentsStore {
  listTopLevel(resource: string, opts?: ListOptions): Promise<Paginated<Comment>>
  listReplies(commentId: string, opts?: ListOptions): Promise<Paginated<Comment>>
  getComment(id: string): Promise<Comment | null>
  createComment(input: CreateCommentInput): Promise<Comment>
  updateComment(id: string, body: string): Promise<Comment>
  deleteComment(id: string, policy: DeletionPolicy): Promise<void>
  listReactionsForComments(commentIds: string[]): Promise<Reaction[]>
  getUserReactions(userId: string, commentIds: string[]): Promise<Reaction[]>
  addReaction(input: CreateReactionInput): Promise<Reaction>
  removeReaction(commentId: string, userId: string, type: string): Promise<void>
  deleteUserData(userId: string): Promise<DeleteUserDataResult>
  hasReplies(commentId: string): Promise<boolean>
}
```

Design notes:

- It is shaped around the **domain**, not generic CRUD. Reads batch reactions (`listReactionsForComments`) to avoid N+1 queries.
- Implementations **must not** enforce authorization — that is the service layer's job. A store is a data-access primitive.
- `deleteComment` receives the `DeletionPolicy` (`'author' | 'user-deletion'`) so soft/hard semantics are applied consistently by the store.
- The interface is intentionally small. If a backend genuinely cannot support an operation (e.g. an eventually-consistent mirror), implement what you can and document the trade-off rather than growing the interface for one adapter.

`D1CommentsStore` uses parameterized prepared statements throughout and resolves its binding from the request event. See `src/runtime/server/repositories/d1-comments-store.ts`.

### Swapping implementations

`getCommentsStore(event)` is the single place a concrete store is constructed. A consumer could replace it (for testing or a different backend) while the rest of the package is unchanged. The domain never imports `@cloudflare/workers-types`.

## Extension ports

Two smaller ports keep infrastructure concerns out of the domain:

- **`RateLimiter`** (`src/runtime/server/utils/rate-limiter.ts`) — `isLimited(event, scope)`. The default in-memory implementation is a development convenience; production should implement this over Cloudflare WAF or the Workers Rate Limiting binding.
- **`AuthorResolver`** (`src/runtime/server/utils/author-resolver.ts`) — bundled reads do not need it because author display info is snapshotted on the comment row. The port is retained as an optional extension point for backends that resolve author info at read time.

## Future: GitHub Discussions (not implemented)

GitHub Discussions is a possible **future adapter/mirror**, not part of the MVP. It must not be the canonical identity system, and comment creation must never depend on GitHub being reachable.

The intended architecture is a one-way, asynchronous mirror behind the adapter boundary:

```text
Better Auth
    │
    ▼
   D1  ──►  Queue  ──►  GitHub Discussions (asynchronous mirror)
    ▲
    └────  GitHub webhook  ◄────  discussions
```

Concretely, adding it later should not require touching the domain model or the Vue components:

1. A GitHub adapter/mirror consumes domain events (or a queue of them) after D1 commits.
2. Inbound webhooks write back through the same domain operations.
3. `CommentsStore` remains the canonical store; GitHub is a projection.

What the current design guarantees for that future:

- No GitHub concepts in the core comment model (`Comment`, `Reaction`, `CommentsStore`).
- No provider logic in the UI; authentication remains Better Auth's concern.
- The API and components depend on the interface, so a mirror can be added beside D1 without rewriting them.
