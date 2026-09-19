/**
 * User-facing strings for the comments components.
 *
 * The package ships English defaults and no i18n runtime: consumers override
 * any subset via the `comments.messages` module option. Messages are plain
 * strings so they survive serialization into `runtimeConfig.public`; dynamic
 * parts use `{placeholder}` tokens resolved by `formatMessage`.
 */
export interface CommentsMessages {
  /** Section heading and root `aria-label`. */
  comments: string
  /** Shown while the first page loads. */
  loading: string
  /** Shown when the list request fails. */
  loadFailed: string
  /** Shown when the resource has no comments. */
  empty: string
  /** Top-level pagination button. */
  loadMore: string
  /** Composer placeholder for a new top-level comment. */
  writeComment: string
  /** Composer placeholder while editing. */
  editComment: string
  /** Composer placeholder while replying. `{author}` is the parent's author. */
  replyTo: string
  /** Reply action label. */
  reply: string
  /** Edit action label. */
  edit: string
  /** Delete action label. */
  delete: string
  /** Body placeholder for a soft-deleted comment. */
  deleted: string
  /** Author placeholder when the snapshot was removed. */
  deletedAuthor: string
  /** Toggle label for a collapsed reply thread. */
  viewReplies: string
  /** Pagination button inside a reply thread. */
  loadMoreReplies: string
  /** Reaction button `aria-label`. `{type}` is the reaction type. */
  reactWith: string
  /** Comment `aria-label`. `{author}` is the author name. */
  commentBy: string
  /** Comment `aria-label` when the author was deleted. */
  commentByDeletedAuthor: string
  /** Reply action `aria-label`. `{id}` is the comment id. */
  replyToComment: string
  /** Edit action `aria-label`. `{id}` is the comment id. */
  editCommentAria: string
  /** Delete action `aria-label`. `{id}` is the comment id. */
  deleteCommentAria: string
  /** Show-replies `aria-label`. `{id}` is the comment id. */
  showReplies: string
  /** Sign-in gate `aria-label`. */
  signInToComment: string
  /** Sign-in gate prompt. */
  signInPrompt: string
  /** Provider button label. `{provider}` is the provider name. */
  continueWith: string
  /** Composer form `aria-label`. */
  composer: string
  /** Textarea `aria-label`. */
  commentBody: string
  /** Composer submit button. */
  post: string
  /** Reactions group `aria-label`. */
  reactions: string
}

/** Default English messages. Consumers override any subset via module options. */
export const defaultCommentsMessages: CommentsMessages = {
  comments: 'Comments',
  loading: 'Loading comments…',
  loadFailed: 'Failed to load comments.',
  empty: 'No comments yet.',
  loadMore: 'Load more',
  writeComment: 'Write a comment…',
  editComment: 'Edit your comment…',
  replyTo: 'Reply to {author}…',
  reply: 'Reply',
  edit: 'Edit',
  delete: 'Delete',
  deleted: '[deleted]',
  deletedAuthor: '[deleted author]',
  viewReplies: 'View replies',
  loadMoreReplies: 'Load more replies',
  reactWith: 'React with {type}',
  commentBy: 'Comment by {author}',
  commentByDeletedAuthor: 'Comment by deleted author',
  replyToComment: 'Reply to comment {id}',
  editCommentAria: 'Edit comment {id}',
  deleteCommentAria: 'Delete comment {id}',
  showReplies: 'Show replies to comment {id}',
  signInToComment: 'Sign in to comment',
  signInPrompt: 'You need to be signed in to comment.',
  continueWith: 'Continue with {provider}',
  composer: 'Comment composer',
  commentBody: 'Comment body',
  post: 'Post',
  reactions: 'Reactions',
}

/**
 * Replace `{token}` placeholders with values. Unknown tokens are left intact
 * so a missing param is visible rather than silently dropped.
 */
export function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match)
}
