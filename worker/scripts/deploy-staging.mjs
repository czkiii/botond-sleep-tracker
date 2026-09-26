import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workerDir = fileURLToPath(new URL('../', import.meta.url))

export function stagingDeployArgs({ head, status, ciSha, dryRun = false }) {
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Cannot identify the checkout commit.')
  if (ciSha !== undefined && ciSha !== head) {
    throw new Error('WORKERS_CI_COMMIT_SHA does not match the checkout commit.')
  }
  if (status.trim() && !dryRun) {
    throw new Error('Commit all local changes before deploying an identified staging build.')
  }
  // An uncommitted dry run can be inspected, but cannot impersonate a commit.
  const sha = status.trim() ? 'local' : head
  return ['deploy', '--config', 'wrangler.staging.jsonc',
    '--define', `__SOLEMI_BUILD_SHA__:${JSON.stringify(sha)}`,
    ...(dryRun ? ['--dry-run', '--outdir', '.wrangler/staging-dry-run'] : [])]
}

function main() {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run deploy:staging -- [--dry-run]')
  }
  const git = (...args) => execFileSync('git', args, { cwd: workerDir, encoding: 'utf8' }).trim()
  const deployArgs = stagingDeployArgs({
    head: git('rev-parse', 'HEAD'),
    status: git('status', '--porcelain', '--untracked-files=all'),
    ciSha: process.env.WORKERS_CI_COMMIT_SHA,
    dryRun: args.includes('--dry-run')
  })
  const require = createRequire(import.meta.url)
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js')
  const result = spawnSync(process.execPath, [wrangler, ...deployArgs], {
    cwd: workerDir, stdio: 'inherit', env: process.env
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
