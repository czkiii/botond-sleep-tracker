// Offline preparation only. Never creates, deploys, seeds or modifies a remote resource.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, createPublicKey } from 'node:crypto'

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const hash = text => createHash('sha256').update(text).digest('hex')
export const productionNames = Object.freeze({worker:'solemi-sleep-sync-v4', pages:'solemi-sleep-app',
  database:'solemi-sleep-db-v4', journal:'solemi-erasure-journal-production-v4'})
export const appOrigin = 'https://app.solemi-sleep.app'
const reservedIds = new Set(['8ace71f6-9c2d-445f-8788-a76bedcdd7bc',
  '1fdd9f64-ea4b-4499-9b6e-636462d51d37', '2d932996-4b9b-4a78-87fb-34a79acfd700'])

export function productionPackage(input) {
  const {databaseId, journalId, workerOrigin, googleClientId, publicJwk, buildSha} = input || {}
  if ([databaseId,journalId].some(id=>typeof id!=='string' || !uuid.test(id) || reservedIds.has(id))
    || databaseId === journalId) throw new Error('NEW_DISTINCT_PRODUCTION_DATABASES_REQUIRED')
  if (typeof workerOrigin!=='string' || !/^https:\/\/solemi-sleep-sync-v4\.[a-z0-9-]+\.workers\.dev$/.test(workerOrigin))
    throw new Error('EXACT_NEW_WORKER_ORIGIN_REQUIRED')
  if (typeof googleClientId!=='string' || !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(googleClientId))
    throw new Error('GOOGLE_CLIENT_REQUIRED')
  if (typeof buildSha!=='string' || !/^[a-f0-9]{40}$/.test(buildSha)) throw new Error('COMMITTED_RELEASE_SHA_REQUIRED')
  // Reject private key material rather than accidentally copying it into the browser build.
  if (!publicJwk || publicJwk.kty!=='EC' || publicJwk.crv!=='P-256'
    || Object.keys(publicJwk).some(key=>!['kty','crv','x','y','kid','alg','use','key_ops','ext'].includes(key))
    || (publicJwk.alg && publicJwk.alg!=='ES256')) throw new Error('PUBLIC_ES256_KEY_ONLY')
  createPublicKey({key:publicJwk,format:'jwk'})
  const publicKey = {kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y}
  const config = {
    name:productionNames.worker, main:resolve(workerRoot,'src/index.ts'), compatibility_date:'2026-08-22',
    workers_dev:true, preview_urls:false,
    vars:{SOLEMI_ENVIRONMENT:'production',ALLOWED_ORIGINS:appOrigin,GOOGLE_CLIENT_ID:googleClientId,
      ACCOUNT_FAMILY_BRIDGE:'true',ENTITLEMENT_ENFORCEMENT:'true',ENTITLEMENT_TEST_MODE:'false',
      RECONCILIATION_CONFLICTS:'true',TRIAL_ENABLED:'false',ACCOUNT_DELETION_ENABLED:'false',
      ACCOUNT_DELETION_MAINTENANCE:'false',RETENTION_MAINTENANCE:'false',RESTORE_MAINTENANCE:'true',
      TRIAL_IDENTITY_KEY_VERSION:'v1',DELETION_SOURCE_DATABASE_ID:databaseId},
    define:{__SOLEMI_BUILD_SHA__:JSON.stringify(buildSha)},
    triggers:{crons:[]},
    ratelimits:[['API_LIMITER','19400',6000],['AUTH_LIMITER','19401',120],['INVITE_LIMITER','19402',30]]
      .map(([name,namespace_id,limit])=>({name,namespace_id,simple:{limit,period:60}})),
    d1_databases:[{binding:'DB',database_name:productionNames.database,database_id:databaseId},
      {binding:'ERASURE_JOURNAL',database_name:productionNames.journal,database_id:journalId}]
  }
  const frontend = {VITE_RELEASE_CHANNEL:'production',VITE_HOSTING_PLATFORM:'cloudflare-pages',
    VITE_BASE_PATH:'/',VITE_ACCOUNT_AUTH:'true',VITE_INTERNAL_PREVIEW:'false',
    VITE_ACCOUNT_API_BASE:'/api',VITE_SYNC_API_BASE:workerOrigin,VITE_ENTITLEMENT_TEST_MODE:'false',
    VITE_BUILD_SHA:buildSha,VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK:JSON.stringify(publicKey)}
  const files = ['schema.sql',...readdirSync(resolve(workerRoot,'migrations'))
    .filter(file=>/^\d{3}_.*\.sql$/.test(file) && file>='003').sort().map(file=>'migrations/'+file)]
  const sourceSql = files.map(file=>readFileSync(resolve(workerRoot,file),'utf8')).join('\n')
  const journalSql = ['erasure-journal/schema.sql','erasure-journal/002_retention.sql']
    .map(file=>readFileSync(resolve(workerRoot,file),'utf8')).join('\n')
    + `\nINSERT INTO journal_identity VALUES (1,'production','${databaseId}');\n`
  const manifest = {format:'solemi-production-v4-preparation-v1',names:productionNames,appOrigin,
    workerOrigin,databaseId,journalId,buildSha,remoteApplied:false,
    sourceSchemaFiles:files,sourceSchemaSha256:hash(sourceSql),journalSchemaSha256:hash(journalSql),
    requiredSecrets:['TOKEN_PEPPER','AUTH_SECRET','TRIAL_IDENTITY_SECRET','OFFLINE_ENTITLEMENT_PRIVATE_JWK'],
    activationPending:['Verify actual Cloudflare resource names/IDs and empty targets',
      'Commit and merge reviewed package; build exact approved main SHA',
      'Provision independent production secrets and matching public/private ES256 key',
      'Initialize independent trial programme and verified retention inventory',
      'Verify OAuth origin, proxy, maintenance/cron and machine smoke before cutover',
      'Prepare fresh diary export and verified account-specific 90-day grant at cutover'],
    familyAccess:{days:90,features:['FAMILY_SYNC','PDF_EXPORT','FAMILY_PLUS_INSIGHTS'],source:'ADMIN',
      consumesTrial:false,automaticPayment:false,recipient:'Private operator decision; resolve actual new Google account ID at cutover'}}
  return {'worker.frozen.jsonc':JSON.stringify(config,null,2)+'\n',
    'frontend.env.local':Object.entries(frontend).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',
    'pages-production-vars.json':JSON.stringify({SOLEMI_PROXY_ENV:'production',SOLEMI_API_ORIGIN:workerOrigin},null,2)+'\n',
    'source-schema.sql':sourceSql,'journal-schema.sql':journalSql,'manifest.json':JSON.stringify(manifest,null,2)+'\n'}
}

// Shared by the account-specific grant preparer. Private outputs never overwrite old evidence.
export function writePrivatePackage(output, artifacts) {
  const root=resolve(workerRoot,'..'), destination=resolve(output), rel=relative(root,destination)
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || !rel.split(/[\\/]/).includes('.private-backups'))
    throw new Error('NEW_PRIVATE_OUTPUT_DIRECTORY_REQUIRED')
  if (existsSync(destination)) throw new Error('OUTPUT_ALREADY_EXISTS')
  let ancestor=dirname(destination)
  while (!existsSync(ancestor)) ancestor=dirname(ancestor)
  const physicalRel=relative(realpathSync(root),realpathSync(ancestor))
  if (isAbsolute(physicalRel) || physicalRel.startsWith('..')) throw new Error('OUTPUT_PARENT_OUTSIDE_REPOSITORY')
  mkdirSync(destination,{recursive:true})
  for (const [name,content] of Object.entries(artifacts)) writeFileSync(resolve(destination,name),content,{flag:'wx',mode:0o600})
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [input,output,...extra]=process.argv.slice(2)
    if (!input || !output || extra.length) throw new Error('INPUT_AND_NEW_PRIVATE_OUTPUT_REQUIRED')
    writePrivatePackage(output,productionPackage(JSON.parse(readFileSync(input,'utf8'))))
    console.log('Frozen production package prepared locally. No remote changes.')
  } catch { console.error('Preparation refused: verify resource IDs, public key, release SHA and new private output directory.'); process.exitCode=1 }
}
