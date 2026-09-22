-- Make comments.user_id nullable so a user's personally identifiable
-- information can be fully erased while keeping thread-anchoring tombstones
-- (a tombstone for a comment that has replies is kept, but carries no user id).
--
-- Do NOT rebuild the table with CREATE new / DROP old: D1 always enforces
-- foreign keys and cannot disable them inside a migration. DROP TABLE comments
-- would (a) cascade-delete every comment_reactions row and (b) trip the
-- self-referential parent_id RESTRICT foreign key. `ALTER TABLE ... DROP COLUMN`
-- rewrites the table without firing foreign key actions, so it is safe here.
--
-- comment_reactions.user_id stays NOT NULL: those rows are hard-deleted, never
-- tombstoned.

PRAGMA defer_foreign_keys = on;

ALTER TABLE comments ADD COLUMN user_id_new TEXT;
UPDATE comments SET user_id_new = user_id;
DROP INDEX IF EXISTS idx_comments_user;
ALTER TABLE comments DROP COLUMN user_id;
ALTER TABLE comments RENAME COLUMN user_id_new TO user_id;
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, created_at);
