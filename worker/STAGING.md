# Family Sync staging

This environment connects only to `https://solemi-sleep-internal.pages.dev`. It uses a separate Worker and a separate D1 database; the production Worker and database must not be reused.

## One-time setup

1. Create an EU-jurisdiction D1 database named `solemi-sleep-db-staging` and bind its ID in `wrangler.staging.jsonc`.
2. From the `worker` directory, apply the complete current schema to the empty staging database:

   ```sh
   npm run db:apply:staging
   ```

   Use `schema.sql` for a new empty staging database. Migration `002_children_v4.sql` is reserved for rehearsing an upgrade of an existing V3 database and for the later production release.

3. Deploy the staging Worker:

   ```sh
   npm run deploy:staging
   ```

4. Add a unique `TOKEN_PEPPER` secret to the staging Worker. Do not copy a production secret into staging:

   ```sh
   npm run secret:staging
   ```

5. In the Cloudflare Pages project `solemi-sleep-internal`, add this production build variable, using the actual staging Worker URL:

   ```text
   VITE_SYNC_API_BASE=https://solemi-sleep-sync-staging.<account-subdomain>.workers.dev
   ```

6. Redeploy the internal Pages project. Its top banner must say `Family Sync staging`, never `Family Sync disabled`.

## Automated smoke test

The smoke test checks health, internal-origin CORS, rejection of anonymous legacy family creation/join, and the account-session requirements for access, family mutations and the test-plan endpoint. It sends no credentials and creates no family or diary data. Empty create/join bodies also prevent creation if enforcement is accidentally disabled. The full two-account sync remains a separate manual acceptance test.

The expected **full 40-character commit SHA is mandatory**. The test waits up to eight minutes for `/health` to return that SHA in both the JSON body and `X-Solemi-Build-Sha`. Until then it only polls health. It then checks the SHA on every auth response and on a final health request. Missing identity, a stale or newer deployment, or a version change during the probes cannot pass. Requests bypass caching and reject redirects.

GitHub Actions runs the same script after staging Worker changes on `feat/child-profile-v4`, with `SOLEMI_EXPECTED_BUILD_SHA` set to the triggering `github.sha`. Manual Actions runs are restricted to that branch too. A new run cancels an older smoke run; the job has a twelve-minute limit including setup and the deployment wait. If Cloudflare skips a superseded commit, that commit cannot get a passing smoke result from another build.

Run locally from `worker` (PowerShell), after the intended commit has been deployed:

```powershell
$env:SOLEMI_STAGING_API_BASE = 'https://solemi-sleep-sync-staging.<account-subdomain>.workers.dev'
$env:SOLEMI_EXPECTED_BUILD_SHA = (git rev-parse HEAD).Trim()
npm run smoke:staging
```

Do not copy the expected SHA from the running server: it must come from the commit being accepted. A timeout means the deployment is missing, unidentified, different, unreachable or unhealthy; it is not an acceptance result. The log includes the expected SHA and last failure. The script never prints device tokens or invite codes.

### How the Worker gets its identity

Cloudflare Workers Builds is configured with root directory `/worker`, an empty build command, and deploy command `npm run deploy:staging`. Keep that deploy command: the wrapper reads Git HEAD and injects it as a compile-time Wrangler define. It also checks Cloudflare's [`WORKERS_CI_COMMIT_SHA`](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) when present and refuses a mismatch or a dirty checkout. The SHA is part of the bundled code, not a mutable dashboard variable. The package manifest and lockfile must remain unchanged by dependency installation.

The health body exposes `data.buildSha`; every Worker response, including errors and preflight, exposes `X-Solemi-Build-Sha`. Unstamped builds report `local`, which smoke rejects. Direct `wrangler deploy --config wrangler.staging.jsonc` bypasses stamping and therefore cannot pass this gate.

Local packaging without publishing is available from `worker`:

```sh
npm run deploy:staging -- --dry-run
```

With local changes, this produces an explicitly `local` artifact under `.wrangler/staging-dry-run`; a clean checkout uses its SHA. CI runs this packaging check too. Neither dry-run nor automated smoke replaces the authenticated two-account acceptance test or the separate production release gates.

## Manual phone test

- Create a family on one browser/device.
- Join it from a private tab or second device with the invite code.
- Start one sleep for each child and confirm both remain active.
- Edit one session on device A and confirm it appears on device B.
- Delete one session and confirm it disappears on device B.
- Confirm profile photos remain local to each device.

## Stop / rollback

Remove `VITE_SYNC_API_BASE` from `solemi-sleep-internal` and redeploy it. The internal app returns to `Family Sync disabled`; production remains unchanged.
