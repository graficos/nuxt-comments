# Adapter architecture

The domain and API layers never talk to D1 directly. They depend on a small interface, `CommentsStore`, and the shipped `D1CommentsStore` implements it. This boundary is what makes an alternative backend (or a mirror) possible without touching the API, services, composables, or components.

This is the package's application of **ports and adapters (hexagonal)**: `CommentsService` (the domain core) defines and depends on the ports — `CommentsStore` for persistence and `RateLimiter` for abuse prevention — and the adapters (`D1CommentsStore`, `InMemoryRateLimiter` / `NoopRateLimiter`) implement those ports and depend on infrastructure. Dependencies point inward (the core never imports `@cloudflare/workers-types`); implementations point outward. `useCommentsService(event)` is the composition root — the single place that constructs the concrete adapters and injects them.

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

The server-only `deleteCommentsUser(event, userId)` (`src/runtime/server/services/admin.service.ts`) is the one path that reaches the store without going through `CommentsService`: it calls `getCommentsStore(event).deleteUserData(userId)` directly and performs **no** authorization of its own. Consumers gate it behind their own admin check (see [privacy.md](./privacy.md)). The HTTP endpoint `DELETE /api/_comments/users/:userId` is different — it goes through `CommentsService.deleteUserData`, which enforces self-or-admin authority from the server session.

### Swapping implementations

`getCommentsStore(event)` is where the concrete store adapter is constructed, and `useCommentsService(event)` is the composition root that wires it (plus the limiter and viewer) into `createCommentsService`. A consumer could replace either point (for testing or a different backend) while the rest of the package is unchanged. The domain never imports `@cloudflare/workers-types`.

## Extension port

One smaller port keeps an infrastructure concern out of the domain:

- **`RateLimiter`** (`src/runtime/server/utils/rate-limiter.ts`) — `isLimited(event, scope)`. The default in-memory implementation is a development convenience; production should implement this over Cloudflare WAF or the Workers Rate Limiting binding.

Author display info is snapshotted on the comment row, so bundled reads need no author-resolution port.

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
