// Explicit operator-managed artifacts only. User exports are never discovered
// or deleted. The manifest lives outside the backup it governs.
import { lstatSync, readFileSync, realpathSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const day = 86400000
const timestamp = n => Number.isSafeInteger(n) && n >= 0
export function artifactDeadline(record) {
  if (!timestamp(record.createdAt)) throw new Error('ARTIFACT_TIME_INVALID')
  if (record.kind === 'backup' || record.kind === 'log') return record.createdAt + 30 * day
  if (record.kind !== 'incident') throw new Error('ARTIFACT_KIND_INVALID')
  if (record.closedAt === null) {
    if (!timestamp(record.reviewedAt) || record.reviewedAt < record.createdAt) throw new Error('INCIDENT_REVIEW_REQUIRED')
    return null
  }
  if (!timestamp(record.closedAt) || record.closedAt < record.createdAt) throw new Error('INCIDENT_CLOSURE_INVALID')
  return record.closedAt + 90 * day
}
export function maintainRetainedFiles(root, manifest, { now = Date.now(), apply = false } = {}) {
  if (!timestamp(now) || manifest.format !== 'solemi-retained-files-v1' || !Array.isArray(manifest.records)) throw new Error('MANIFEST_INVALID')
  const directory = realpathSync(root), paths = new Set(), ids = new Set(), plan = []
  for (const record of manifest.records) {
    if (typeof record.id !== 'string' || !record.id || ids.has(record.id) || typeof record.path !== 'string'
      || isAbsolute(record.path) || record.path.includes(':') || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error('MANIFEST_INVALID')
    ids.add(record.id)
    const target = resolve(directory, record.path), rel = relative(directory, target)
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || paths.has(target.toLowerCase())) throw new Error('ARTIFACT_PATH_INVALID')
    paths.add(target.toLowerCase())
    const deadline = artifactDeadline(record)
    if (record.createdAt > now || (record.kind === 'incident' && (record.closedAt ?? record.reviewedAt) > now)) throw new Error('ARTIFACT_TIME_INVALID')
    // Reject symlinks/junctions at every component, not just the leaf.
    let current = directory
    let missing = false
    for (const part of rel.split(sep)) {
      current = resolve(current, part)
      try { if (lstatSync(current).isSymbolicLink()) throw new Error('ARTIFACT_LINK_FORBIDDEN') }
      catch (e) { if (e.code === 'ENOENT') { missing = true; break } throw e }
    }
    if (!missing && (!lstatSync(target).isFile() || realpathSync(target) !== target
      || createHash('sha256').update(readFileSync(target)).digest('hex') !== record.sha256)) throw new Error('ARTIFACT_CONTENT_CHANGED')
    plan.push({ id: record.id, target, missing, expired: deadline !== null && deadline <= now,
      reviewRequired: deadline === null && record.reviewedAt + 30 * day <= now })
  }
  // Validate the entire plan before the first deletion. Only exact files,
  // never recursive directories. Recheck content immediately before unlinking.
  if (apply) for (const item of plan.filter(x => x.expired && !x.missing)) {
    const record = manifest.records.find(r => r.id === item.id)
    if (lstatSync(item.target).isSymbolicLink() || realpathSync(item.target) !== item.target
      || createHash('sha256').update(readFileSync(item.target)).digest('hex') !== record.sha256) throw new Error('ARTIFACT_CONTENT_CHANGED')
    unlinkSync(item.target)
  }
  return { applied: apply, expired: plan.filter(x => x.expired).map(x => x.id),
    absent: plan.filter(x => x.missing || (apply && x.expired)).map(x => x.id),
    reviewRequired: plan.filter(x => x.reviewRequired).map(x => x.id) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, manifest, flag] = process.argv.slice(2)
    if (!root || !manifest || (flag && flag !== '--apply')) throw new Error('Usage: maintain-retained-files.mjs managed-directory manifest.json [--apply]')
    console.log(JSON.stringify(maintainRetainedFiles(root, JSON.parse(readFileSync(manifest, 'utf8')), { apply: flag === '--apply' })))
  } catch { console.error('Retention failed. Inspect the manifest and managed files locally.'); process.exitCode = 1 }
}
