---
title: Nuxt module server-handler paths must omit the file extension
date: 2026-09-12
category: build-errors
module: nuxt-module
problem_type: build_error
component: tooling
symptoms:
  - "Published-package build fails: Cannot resolve '.../dist/runtime/server/api/_comments/resource.get.ts'"
  - "Nitro reports: externals are not allowed"
root_cause: config_error
resolution_type: code_fix
severity: high
tags: [nuxt-module, module-builder, nitro, addserverhandler, build]
---

# Nuxt module server-handler paths must omit the file extension

## Problem

A Nuxt module that registers server handlers with `addServerHandler` must pass a handler path
**without** a file extension. Hard-coding `.ts` works against the source tree but breaks the
published package, where the built runtime files are `.js` and Nitro refuses to treat a missing
`.ts` file as an external.

## Symptoms

- `nuxt-module-build build` (or a consumer's `nuxt build`) fails with
  `Cannot resolve ".../dist/runtime/server/api/_comments/resource.get.ts"` followed by
  "externals are not allowed".
- The source playground works; only the packed/published build fails, which hides the problem
  until a consumer installs the package.

## What Didn't Work

- Passing the explicit `.ts` path because it resolved in the source tree.
- Passing an explicit lowercase `method` to `addServerHandler`. That is wrong for a different
  reason: the method is derived from the filename suffix, and an explicit value overrides it
  incorrectly. Removing the explicit `method` and letting the filename (`.get`, `.post`,
  `.delete`, ...) drive it is the separate half of the same fix.

## Solution

Resolve the handler **without** an extension, and omit `method`:

```ts
addServerHandler({
  route: routes[file]!,
  // No extension: resolves to `.ts` in dev (source) and `.js` in the
  // published `dist` build. The HTTP method is derived from the
  // filename suffix (`.get`, `.post`, ...).
  handler: resolver.resolve(`./runtime/server/api/_comments/${file}`),
})
```

Handler files keep the method suffix in their name (`resource.get.ts`, `comment.patch.ts`), and
`addServerHandler` derives and uppercases the method from it.

## Why This Works

`resolver.resolve` returns a path that Nitro resolves against the runtime directory. In source
that directory contains `.ts` files; in the built package it contains `.js` files. An
extensionless path resolves to whichever exists, so the same module code works in both. Nitro's
"externals are not allowed" is its way of rejecting a path it cannot resolve to a real runtime
module; the missing `.ts` in `dist` is exactly that.

## Prevention

- Never hard-code a source extension in `addServerHandler` / `addPlugin` / runtime paths — let
  the resolver pick the built extension.
- Verify packaging by installing the packed tarball into a clean consumer app and building it;
  the source playground cannot catch this class of bug.
- Keep the method encoded in the handler filename and let `addServerHandler` derive it.

## Related Issues

- Implementation: `src/module.ts`.
