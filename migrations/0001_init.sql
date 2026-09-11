-- nuxt-comments initial schema.
-- Run with: wrangler d1 migrations apply --local  (and --remote for production)

CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY NOT NULL, -- ULID
  resource     TEXT NOT NULL,              -- normalized resource id (opaque)
  user_id      TEXT NOT NULL,              -- Better Auth user id (no FK; auth owns users)
  parent_id    TEXT,                       -- adjacency list; NULL = top-level
  body         TEXT,                       -- original plain text; NULLed on soft-delete
  author_name  TEXT,                       -- display name snapshot; NULLed on user-deletion
  author_image TEXT,                       -- avatar URL snapshot; NULLed on user-deletion
  created_at  TEXT NOT NULL,              -- ISO 8601
  updated_at  TEXT NOT NULL,
  deleted_at   TEXT,                       -- soft-delete timestamp
  deleted_by   TEXT,                       -- 'author' | 'user-deletion' | NULL
  -- Invariant: only soft-deleted comments may have a NULL body.
  CHECK (body IS NOT NULL OR deleted_at IS NOT NULL),
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE RESTRICT
);

-- Access patterns:
--   * all top-level comments for resource  (resource, parent_id, created_at, id)
--   * replies for comment                  (parent_id, created_at, id)
--   * comments by user                      (user_id, created_at)
-- `id` is included so the (created_at DESC, id DESC) sort is fully
-- index-satisfied (no temp B-tree tie-break).
CREATE INDEX IF NOT EXISTS idx_comments_resource_top
  ON comments(resource, parent_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_comments_replies ON comments(parent_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, created_at);

CREATE TABLE IF NOT EXISTS comment_reactions (
  id         TEXT PRIMARY KEY NOT NULL, -- ULID
  comment_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,              -- configurable reaction type string
  created_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  UNIQUE (comment_id, user_id, type)     -- prevents duplicate same-type reaction by same user
);
-- The UNIQUE(comment_id, user_id, type) index already serves comment_id lookups.
CREATE INDEX IF NOT EXISTS idx_reactions_user ON comment_reactions(user_id);
