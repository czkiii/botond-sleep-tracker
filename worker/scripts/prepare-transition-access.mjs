// A one-off, non-trial ADMIN grant. No subscription, payment or remote execution.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writePrivatePackage } from './prepare-production-v4.mjs'

export const transitionSource = 'production-v4-transition-2026'
export function transitionAccess({accountId,verifiedEmail,startsAt}) {
  if (typeof accountId!=='string' || !/^acc_[a-f0-9]{32}$/.test(accountId)
    || typeof verifiedEmail!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)
    || !Number.isSafeInteger(startsAt) || startsAt<0 || !Number.isSafeInteger(startsAt+90*86400000))
    throw new Error('VERIFIED_NEW_ACCOUNT_AND_CUTOVER_TIME_REQUIRED')
  const email=verifiedEmail.toLowerCase().replaceAll("'","''"), until=startsAt+90*86400000
  // One INSERT is atomic. NULL account_id raises NOT NULL on missing identity,
  // a replay, a second recipient, or a blocked restore; no partial/renewed grant.
  const sql=`INSERT INTO account_entitlements
    (id,account_id,feature_key,source_type,source_id,valid_from,valid_until,revoked_at,created_at,updated_at)
  SELECT '${transitionSource}_' || feature_key,
    (SELECT a.id FROM accounts a WHERE a.id='${accountId}' AND a.status='ACTIVE'
      AND EXISTS (SELECT 1 FROM account_identities i WHERE i.account_id=a.id AND i.provider='GOOGLE'
        AND i.email_verified=1 AND lower(i.email_at_login)='${email}')
      AND (SELECT blocked FROM retention_restore_gate WHERE id=1)=0
      AND NOT EXISTS (SELECT 1 FROM account_entitlements WHERE source_id='${transitionSource}')),
    feature_key,'ADMIN','${transitionSource}',${startsAt},${until},NULL,${startsAt},${startsAt}
  FROM (SELECT 'FAMILY_SYNC' AS feature_key UNION ALL SELECT 'PDF_EXPORT' UNION ALL SELECT 'FAMILY_PLUS_INSIGHTS');\n`
  return {'grant.sql':sql,'manifest.json':JSON.stringify({format:'solemi-transition-access-v1',
    accountId,sourceId:transitionSource,startsAt,endsAt:until,days:90,consumesTrial:false,
    automaticPayment:false,remoteApplied:false},null,2)+'\n',
    'verify.sql':`SELECT account_id,feature_key,source_type,source_id,valid_from,valid_until,revoked_at FROM account_entitlements WHERE source_id='${transitionSource}';\n`}
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [input,output,...extra]=process.argv.slice(2)
    if (!input || !output || extra.length) throw new Error('INPUT_AND_NEW_PRIVATE_OUTPUT_REQUIRED')
    writePrivatePackage(output,transitionAccess(JSON.parse(readFileSync(input,'utf8'))))
    console.log('Account-specific 90-day access prepared privately. No remote grant applied.')
  } catch { console.error('Access preparation refused: verify the new account, identity and cutover timestamp.'); process.exitCode=1 }
}
