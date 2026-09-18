-- Better Auth core tables for Cloudflare D1 (SQLite).
--
-- Matches Better Auth 1.x Kysely adapter defaults (generated with Better Auth's
-- own schema generator): singular table names, camelCase columns, INTEGER
-- epoch-millisecond timestamps and INTEGER 0/1 booleans.
--
-- This covers the core tables only: user, session, account, verification.
-- Plugin tables (twoFactor, organization, ...) are NOT included — add them with
-- `npx auth@latest generate` if you enable Better Auth plugins.
--
-- Apply with a Wrangler config whose binding points at your auth database:
--   wrangler d1 migrations apply <database> --local  --config <config>
--   wrangler d1 migrations apply <database> --remote --config <config>
--
-- The filename is deliberately unique (`0001_better_auth.sql`, not
-- `0001_init.sql`): Wrangler records applied migrations per database in
-- `d1_migrations` keyed by filename, so comments and auth migrations can share
-- one D1 database without colliding.

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image"         TEXT,
  "createdAt"     INTEGER NOT NULL,
  "updatedAt"     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token"     TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT PRIMARY KEY NOT NULL,
  -- `issuer` existed in Better Auth 1.7.0–1.7.2 and was removed in 1.7.3.
  -- Kept nullable so the same schema works for the whole `>=1.7.1 <2` range:
  -- 1.7.1/1.7.2 write it, 1.7.3+ never writes it.
  "issuer"                TEXT,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             INTEGER NOT NULL,
  "updatedAt"             INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_uidx" ON "account" ("issuer", "accountId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  INTEGER NOT NULL,
  "createdAt"  INTEGER NOT NULL,
  "updatedAt"  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
