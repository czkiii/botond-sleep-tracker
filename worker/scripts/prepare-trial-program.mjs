// Prepares a local SQL artifact only. Secret comes from the process environment,
// never a command-line argument, output, or checked-in configuration.
import { createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export function trialProgramSql({ secret, version, reviewedAt }) {
  if (typeof secret !== 'string' || secret.length < 32 || !/^[a-zA-Z0-9_-]{1,40}$/.test(version)
    || !Number.isSafeInteger(reviewedAt) || reviewedAt < 0 || reviewedAt > Date.now()) throw new Error('TRIAL_PROVISION_INPUT_INVALID')
  const check = createHmac('sha256', secret).update('solemi:trial-key-check:v1').digest('hex')
  return `-- Independent journal only; deliberately fails if already provisioned.\n` +
    `INSERT INTO trial_program (id,active,key_version,key_check,reviewed_at,ended_at) VALUES (1,1,'${version}','${check}',${reviewedAt},NULL);\n`
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [version, reviewedAt, output] = process.argv.slice(2)
    if (!output) throw new Error('OUTPUT_REQUIRED')
    const sql = trialProgramSql({ secret: process.env.TRIAL_IDENTITY_SECRET, version, reviewedAt: Number(reviewedAt) })
    writeFileSync(output, sql, { flag: 'wx', mode: 0o600 })
    console.log('Trial programme SQL prepared locally. No deployment or activation.')
  } catch { console.error('Trial programme preparation failed. Check the secret, version, documented review date and new output path.'); process.exitCode = 1 }
}
