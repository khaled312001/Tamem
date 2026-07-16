# Live backend — `api.php`

**This file is what actually serves `backendtamem.deliverytamem.com/api/v1` in production.**
Not `apps/backend`. The Node backend is uploaded but does not boot on the
shared host (no `node_modules`), so every live request is handled by this PHP
shim. `.htaccess` rewrites `/api/v1/*` → `api.php?path=*`.

## Why it lives here

It used to exist only on the server. On 2026-07-16 it was overwritten by
another deploy, silently reverting fixes that were already live — the admin
products list lost its merchant column and its search, and the bulk
activate/deactivate bar started 404ing. Nothing caught it because there was no
copy under version control to diff against.

Treat this file as source: **edit it here, commit, then deploy.** If you find
the live file differs from this one, someone deployed out of band — diff before
overwriting, or you will wipe their work exactly as ours was wiped.

## Deploy

```
node <scratchpad>/deploy/deploy-apiphp.js
```

Uploads as `api.php.new`, runs `php -l` **on the server**, and only swaps (with
a timestamped `.bak-*` backup) if the syntax check passes. Never edit the live
file in place — a PHP parse error takes the whole API down.

## Before deploying

Pull the live file first (`dl-live.js`) and diff it against this copy. If they
differ, reconcile — do not blindly upload.

## Handlers added on top of the generic resource router

The `$RES` map auto-serves simple CRUD for mapped tables, but returns bare rows
with no joins and ignores query filters. These paths need dedicated handlers,
and each **must stay above the generic `GET /admin/<res>` route** or it will be
intercepted:

- `GET /admin/products` — joins `MerchantProfile` (the table showed `—` for
  every merchant without it) and applies `merchantId` / `search` / `isAvailable`.
- `POST /admin/products/bulk-availability` — bulk activate/deactivate.
- `GET /admin/categories` — adds each category's merchant count so the admin
  screen knows whether a delete can really remove it.
- `DELETE /admin/categories/:id` — `MerchantProfile.categoryId` is a required
  FK, so a category still in use is deactivated rather than deleted (a raw
  DELETE threw an uncaught constraint error).

Note: helpers declared as `function` (`productShape`, `jsonList`, `jsonizeRow`)
are hoisted and safe to call from handlers near the top of the file. Top-level
`const`s such as `MERCHANT_SEL` are **not** — they do not exist until execution
reaches them.
