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

The smoke test refuses any URL that does not contain `staging`. It creates an isolated test family in staging and checks CORS, two children, parallel active sleeps, edit, delete tombstone, invite and second-device sync.

GitHub Actions runs the same smoke script after staging Worker changes on `feat/child-profile-v4`; it can also be started manually from the Actions page.

```sh
SOLEMI_STAGING_API_BASE=https://solemi-sleep-sync-staging.<account-subdomain>.workers.dev npm run smoke:staging
```

The script never prints device tokens or invite codes.

## Manual phone test

- Create a family on one browser/device.
- Join it from a private tab or second device with the invite code.
- Start one sleep for each child and confirm both remain active.
- Edit one session on device A and confirm it appears on device B.
- Delete one session and confirm it disappears on device B.
- Confirm profile photos remain local to each device.

## Stop / rollback

Remove `VITE_SYNC_API_BASE` from `solemi-sleep-internal` and redeploy it. The internal app returns to `Family Sync disabled`; production remains unchanged.
