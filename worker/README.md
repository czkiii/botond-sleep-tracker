# Solemi Sleep Sync Worker

Cloudflare Worker + D1 backend for Solemi Sleep Family Sync V1.

## What is already implemented

- Create a family and first device
- Short-lived, one-use invite codes
- Join a family with a code
- Per-device bearer tokens (only hashes are stored in D1)
- Incremental revision-based sync
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

Apply the database schema:

```bash
npm run db:apply:remote
```

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
POST   /v1/sessions
POST   /v1/sessions/start
POST   /v1/sessions/:id/end
PATCH  /v1/sessions/:id
DELETE /v1/sessions/:id
```

## Important V1 rules

- A family can have at most one active sleep session.
- Active sleeps must be created through `/v1/sessions/start`.
- Active sleeps must be ended through `/v1/sessions/:id/end`.
- Normal edits use PATCH semantics, so unrelated field edits naturally merge.
- Deleted sessions remain as tombstones and cannot be resurrected by a stale PATCH.
- Every client write uses a UUID `operationId` so network retries do not intentionally repeat an operation.
- Server-side family revision order is authoritative; device clocks do not decide conflict order.

## Before public release

The V1 backend still needs production hardening before serving a large public user base, especially automated abuse/rate limiting for onboarding endpoints, observability, retention cleanup for old operation IDs/invites, and a recovery/device-management flow.
