# Components & composables

All components are **unstyled**. They render semantic HTML with accessibility attributes and expose props, typed slots and events. The package ships no CSS, no Tailwind, no design system, and no provider logos.

With the default `components.prefix: 'Nuxt'` the components are `<NuxtComments>`, `<NuxtComment>`, `<NuxtCommentComposer>`, `<NuxtCommentReactions>`, `<NuxtCommentAuth>`. Set `components.prefix: ''` for `<Comments>`, etc. The unprefixed names are used below for brevity.

## `<Comments>`

The main entry point.

```vue
<Comments resource="/blog/my-post" :providers="['github', 'google']" />
```

> Providers are controlled by the component props. All auth config muxt be handled by `@nuxtjs/better-auth`.

### Props

| Prop        | Type       | Required | Description                                                                  |
| ----------- | ---------- | -------- | ---------------------------------------------------------------------------- |
| `resource`  | `string`   | yes      | Opaque resource identifier. Normalized before requests.                      |
| `limit`     | `number`   | no       | Initial page size for top-level comments. Defaults to `pagination.pageSize`. |
| `providers` | `string[]` | no       | Provider names passed to the login UI. Consumer-owned.                       |

#### Providers config

Two separate layers:

- Which buttons show → `<Comments :providers="[...]" />` (or the `CommentAuth #login` slot), set at the call site.
- Which buttons can actually work `server/auth.config.ts` enables the provider + its `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` env vars.

### Slots

| Slot        | Slot props                 | Purpose                                          |
| ----------- | -------------------------- | ------------------------------------------------ |
| `header`    | `{ resource, count }`      | Replaces the default heading.                    |
| `loading`   | —                          | Loading state (only while the first page loads). |
| `error`     | `{ error }`                | Error state.                                     |
| `empty`     | —                          | Empty state.                                     |
| `list`      | `{ comments }`             | Replace the whole list rendering.                |
| `load-more` | `{ fetchMore }`            | Replace the pagination control.                  |
| `composer`  | `{ submit, isSubmitting }` | Replace the composer.                            |
| `login`     | `{ signIn, providers }`    | Replace the sign-in gate.                        |
| `footer`    | `{ resource }`             | Appended after everything.                       |

### Forwarded per-comment slots

These are forwarded to every `<Comment>` in the tree (including nested replies):

| Slot              | Slot props                                                   |
| ----------------- | ------------------------------------------------------------ |
| `comment`         | `{ comment }`                                                |
| `comment-author`  | `{ comment }`                                                |
| `comment-body`    | `{ comment }`                                                |
| `comment-actions` | `{ comment, canEdit, canDelete, onReply, onEdit, onDelete }` |
| `reaction`        | `{ comment, type, count, active, toggle }`                   |
| `reply`           | `{ comment, replies, expanded, hasMore, toggle, loadMore }`  |

### Events

```text
create(comment)
update(comment)
delete(comment)
reply(comment)
react({ comment, type })
unreact({ comment, type })
error(error)
```

### Example: custom presentation

```vue
<Comments resource="/blog/my-post" :providers="['github']">
  <template #loading>
    <p class="skeleton">Loading…</p>
  </template>

  <template #comment-author="{ comment }">
    <strong>{{ comment.authorName ?? 'Someone' }}</strong>
  </template>

  <template #comment-body="{ comment }">
    <div class="prose" v-text="comment.body ?? '[deleted]'" />
  </template>

  <template #comment-actions="{ comment, canEdit, onReply, onDelete }">
    <button @click="onReply(comment)">Reply</button>
    <button v-if="canEdit" @click="onDelete(comment)">Delete</button>
  </template>

  <template #reaction="{ type, count, active, toggle }">
    <button :aria-pressed="active" @click="toggle()">
      {{ emojiFor(type) }} {{ count }}
    </button>
  </template>

  <template #login="{ signIn }">
    <button @click="signIn('github')">Continue with GitHub</button>
  </template>
</Comments>
```

The comment body is always rendered as **escaped text**, never `v-html`. The built-in renderer preserves line breaks via `white-space: pre-wrap`; if you render your own, do the same. Markdown is not part of the MVP.

## `<Comment>`

Renders one comment and recursively renders its loaded replies.

| Prop               | Type                        | Description                            |
| ------------------ | --------------------------- | -------------------------------------- |
| `comment`          | `Comment`                   | The comment to render.                 |
| `canEdit`          | `boolean`                   | Whether the viewer may edit/delete this comment. Use at the top level. |
| `viewerUserId`     | `string`                    | Current viewer id. When set, `canEdit` is derived per comment, so nested replies are checked against their own author. |
| `reactionTypes`    | `string[]`                  | Reaction types to render.              |
| `repliesByComment` | `Record<string, Comment[]>` | Loaded replies keyed by comment id.    |
| `replyHasMore`     | `Record<string, boolean>`   | Whether more replies can be loaded.    |
| `replyExpanded`    | `Record<string, boolean>`   | Whether a thread is expanded.          |

Events: `reply`, `edit`, `delete`, `react`, `unreact`, `toggle-replies`, `load-replies`.

A soft-deleted comment renders `[deleted]`; a comment whose author snapshot was cleared renders `[deleted author]`.

## `<CommentComposer>`

| Prop           | Type      | Description                            |
| -------------- | --------- | -------------------------------------- |
| `placeholder`  | `string`  | Textarea placeholder.                  |
| `isSubmitting` | `boolean` | Disables the control while submitting. |
| `submitLabel`  | `string`  | Submit button label.                   |

Slot: `composer({ submit, isSubmitting, body })` — call `submit(value)` with custom state or `submit()` to use the built-in textarea. Event: `submit(body)`.

## `<CommentReactions>`

| Prop            | Type       | Description                                                     |
| --------------- | ---------- | --------------------------------------------------------------- |
| `comment`       | `Comment`  | Renders `comment.reactionCounts` and `comment.viewerReactions`. |
| `reactionTypes` | `string[]` | Types to render.                                                |

Slot: `reaction({ comment, type, count, active, toggle })`. Events: `react({ comment, type })`, `unreact({ comment, type })`.

The package never picks an emoji or icon. You map `type` (`'like'`, `'heart'`, …) to a visual.

## `<CommentAuth>`

| Prop        | Type       | Description              |
| ----------- | ---------- | ------------------------ |
| `providers` | `string[]` | Provider names to offer. |

Slot: `login({ signIn, providers })`. Default rendering is text-only buttons ("Continue with github"), no assets.

## Composables

### `useComments(resource, options?)`

```ts
const {
  comments, // Ref<Comment[]>            top-level comments
  loading, // Ref<boolean>
  error, // Ref<Error | null>
  hasMore, // Ref<boolean>
  repliesByComment, // Ref<Record<string, Comment[]>>
  expanded, // Ref<Record<string, boolean>>
  replyHasMore, // Ref<Record<string, boolean>>
  loadReplies, // (commentId: string) => Promise<void>
  toggleReplies, // (commentId: string) => Promise<void>
  fetchMore, // () => Promise<void>
  refresh, // () => Promise<void>
  createComment, // (body: string) => Promise<Comment>
  reply, // (parentId: string, body: string) => Promise<Comment>
  updateComment, // (commentId: string, body: string) => Promise<Comment>
  deleteComment, // (commentId: string) => Promise<void>
  react, // (commentId: string, type: string) => Promise<void>
  unreact, // (commentId: string, type: string) => Promise<void>
} = useComments("/blog/my-post");
```

`resource` may be a string or a `Ref<string>`; the composable reloads when it changes.

### `useCommentsSession()`

```ts
const { user, status, loggedIn, ready, signIn, signOut } = useCommentsSession();
```

A thin wrapper over Better Auth's session API. `signIn(provider)` delegates to the Better Auth client.

## Types

```ts
import type {
  Comment,
  Reaction,
  Author,
  Cursor,
  Paginated,
} from "nuxt-comments/types";
import type { CommentsStore, DeleteUserDataResult } from "nuxt-comments/server";
import type { ModuleOptions } from "nuxt-comments";
```

| Type           | Description                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Comment`      | The domain comment: `id`, `resource`, `userId`, `parentId`, `body`, `createdAt`, `updatedAt`, `deletedAt`, `deletedBy`, `authorName`, `authorImage`, plus optional `reactionCounts` / `viewerReactions`. |
| `Reaction`     | `id`, `commentId`, `userId`, `type`, `createdAt`.                                                                                                                                                        |
| `Author`       | `{ id, name, image }` (display info; comments snapshot name/image).                                                                                                                                      |
| `Cursor`       | `{ createdAt, id }` — decoded cursor.                                                                                                                                                                    |
| `Paginated<T>` | `{ items: T[], nextCursor: Cursor \| null, hasMore: boolean }`.                                                                                                                                          |

## Styling strategy

- No CSS is shipped. There is no stylesheet to import.
- Components emit semantic elements (`<section>`, `<article>`, `<ol>`, `<button>`, `<textarea>`) and a few stable `data-*` hooks: `data-comments-root`, `data-comments-list`, `data-replies-list`, `data-comment-id`, `data-reaction-type`, `data-active`, `data-comment-composer`.
- Accessibility is built in: `role="comment"`, `aria-label` on comments and actions, `aria-pressed` on reactions, `aria-busy`/`role="status"` for loading, `role="alert"` for errors.
- Style globally, with scoped styles on your slots, or both.
