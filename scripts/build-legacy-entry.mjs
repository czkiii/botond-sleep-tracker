// GitHub Pages serves only the migration entry, never the account-enabled app.
import { mkdir, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('legacy-entry-dist')
await mkdir(output, { recursive: true })
for (const file of ['index.html', 'entry.js', 'entry.css', 'sw.js']) {
  await copyFile(resolve('legacy-entry', file), resolve(output, file))
}
console.log('Built legacy GitHub Pages entry (four static files, no app data).')
