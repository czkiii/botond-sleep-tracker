// Local assets + optional native copy only. No signing, install, deploy or upload.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [platform, option, ...extra] = process.argv.slice(2)
if (!['android', 'ios'].includes(platform) || (option && option !== '--sync') || extra.length) {
  throw new Error('Usage: node scripts/prepare-native-release.mjs android|ios [--sync]')
}
const root = fileURLToPath(new URL('../', import.meta.url))
const env = { ...process.env, SOLEMI_NATIVE_RELEASE_PLATFORM: platform }
const run = (file, args = []) => execFileSync(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit' })
run('scripts/patch-native-purchases.mjs')
run('node_modules/vite/bin/vite.js', ['build', '--mode', `native-${platform}-release`])
// Failures above cannot copy stale staging/release assets into a native project.
if (option === '--sync') run('node_modules/@capacitor/cli/bin/capacitor', ['sync', platform])
console.log(`Prepared ${platform} release assets. Backend readiness, signing and store acceptance remain separate.`)
