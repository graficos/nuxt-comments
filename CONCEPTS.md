# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Comment

A user-authored, plain-text message attached to a resource and identified by an opaque id. Bodies are stored as original text and never rendered as markup.

### Reply

A comment attached to another comment instead of directly to the resource. Replies and top-level comments are the same entity, distinguished only by whether they name a parent; a reply inherits its resource from its parent and cannot be attached across resources.

### Tombstone

A comment kept after deletion with its body cleared, so its replies keep their thread context. Author deletion always leaves a tombstone; account erasure hard-deletes a comment only when it has no replies and otherwise leaves a scrubbed tombstone. A tombstone offers no actions or reactions and renders placeholder body and author text.

## Reaction

A user's typed signal on a comment — for example a like — counted per type. Each user holds at most one reaction of a given type on a comment, and the allowed types are consumer-configured. Reactions are per-user, so they are fetched separately from comment content and merged in on the client.

## Resource

The opaque identifier a comment thread belongs to — usually a page path, but the system does not assume a URL. A resource is normalized to a canonical form on write, so two spellings that normalize alike address the same thread. The reserved `threads/` and `users/` prefixes are rejected as resource ids because they collide with comment-scoped and user-scoped API routes.

## User deletion

Erasing a user's personally identifiable data from the comments domain without deleting their authentication account. It removes the user's reactions, hard-deletes comments that have no replies, and scrubs the surviving tombstones so no user id, display-name snapshot, or avatar remains. Deleting the authentication account is a separate, consumer-owned step that must run after erasure, while the session is still valid.

## Flagged ambiguities

- **"user deletion" vs "account deletion"** — user deletion is the comments-domain erasure only; account deletion is the two-step combination of user deletion followed by auth-account removal.
