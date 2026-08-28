# Solemi Sleep Sync Worker

Cloudflare Worker + D1 backend for Solemi Sleep Family Sync V1.

## What is already implemented

- Create a family and first device
- Short-lived, one-use invite codes
- Join a family with a code
- Per-device bearer tokens (only hashes are stored in D1)
- Incremental revision-based sync
- Multiple child profiles per family, with optional birth dates
- Child-scoped sleep history and one simultaneous active sleep per child
- Start / end sleep lifecycle endpoints
- Manual completed sleep creation
- PATCH-based editing
- Soft-delete tombstones
- Idempotent write operation IDs
- Database-level single-active-sleep constraint
- CORS for the current GitHub Pages frontend and local Vite development

## Cloudflare setup

Run these commands from this `worker` directory.

```bash
npm install
npx wrangler login
npm run db:create
```

`db:create` prints the new D1 database UUID. Copy that UUID into `wrangler.jsonc` in place of:

```text
REPLACE_WITH_D1_DATABASE_ID
```

Create the Worker secret used when hashing device tokens and invite codes:

```bash
npx wrangler secret put TOKEN_PEPPER
```

Use a long random value and keep it private. Do not commit it to GitHub.

For a brand-new empty database, apply the current schema:

```bash
npm run db:apply:remote
```

For an existing V3 database, do **not** reapply `schema.sql`. Back up D1 first,
then apply `migrations/002_children_v4.sql`. The migration creates one stable
legacy child per family, attaches every existing sleep to that child, and
replaces the family-wide active-sleep constraint with a per-child constraint.

Safe production order:

1. Export/back up the remote D1 database.
2. Apply `migrations/002_children_v4.sql` to D1.
3. Deploy the Worker from the same commit.
4. Verify `/health`, create/patch child, two-child active sleep, and `/v1/sync`.
5. Only then release the matching frontend.

Optional local database setup:

```bash
npm run db:apply:local
```

Type-check and deploy:

```bash
npm run typecheck
npm run deploy
```

After deploy, Wrangler prints the `workers.dev` URL. Test it with:

```text
GET https://YOUR-WORKER.workers.dev/health
```

Expected JSON:

```json
{
  "ok": true,
  "data": {
    "service": "solemi-sleep-sync",
    "status": "ok"
  }
}
```

## API V1

Unauthenticated onboarding:

```text
POST /v1/families
POST /v1/join
```

Authenticated with `Authorization: Bearer <deviceToken>`:

```text
POST   /v1/invites
GET    /v1/sync?after=<revision>
GET    /v1/device
POST   /v1/device/leave
POST   /v1/children
PATCH  /v1/children/:id
POST   /v1/sessions
POST   /v1/sessions/start
POST   /v1/sessions/:id/end
PATCH  /v1/sessions/:id
DELETE /v1/sessions/:id
```

## Important V1 rules

- A family can contain any number of active child profiles.
- Each child can have at most one active sleep session; different children may sleep simultaneously.
- Child names and optional birth dates sync. Profile photos stay device-local in this release.
- Active sleeps must be created through `/v1/sessions/start`.
- Active sleeps must be ended through `/v1/sessions/:id/end`.
- Normal edits use PATCH semantics, so unrelated field edits naturally merge.
- Deleted sessions remain as tombstones and cannot be resurrected by a stale PATCH.
- Every client write uses a UUID `operationId` so network retries do not intentionally repeat an operation.
- Server-side family revision order is authoritative; device clocks do not decide conflict order.

## Before public release

The V1 backend still needs production hardening before serving a large public user base, especially automated abuse/rate limiting for onboarding endpoints, observability, retention cleanup for old operation IDs/invites, and a recovery/device-management flow.
