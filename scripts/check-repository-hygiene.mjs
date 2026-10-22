// Check the Git index, not ignored local backups. Never print private filenames
// or file contents in CI logs. Run before packaging or publishing artifacts.
import { execFileSync } from 'node:child_process'

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean)
const blocked = paths.filter(path => /(^|\/)\.private-backups(\/|$)/i.test(path))
if (blocked.length) {
  console.error(`Repository hygiene failed: ${blocked.length} private backup file(s) are tracked. Remove them from the Git index before publishing; preserve needed local originals.`)
  process.exitCode = 1
} else {
  console.log('Repository hygiene passed: no tracked private backup files.')
}
