import { accountRequest, AccountAuthError } from './accountAuth'
import { getActiveAccountWorkspaceId } from './accountWorkspace'
import { loadData } from './storage'
import { loadChildPhoto } from './photoStore'

export async function accountDataExport(accountId: string) {
  const check = () => {
    if (getActiveAccountWorkspaceId() !== accountId) throw new AccountAuthError('ACCOUNT_CONTEXT_CHANGED')
  }
  check()
  const server = await accountRequest('/v1/auth/account/export')
  check()
  const data = loadData(), exportedAt = new Date().toISOString()
  const photos: Array<{ ref: string; dataUrl: string | null }> = []
  for (const ref of new Set(data.children.flatMap(child => child.photoRef ? [child.photoRef] : []))) {
    const blob = await loadChildPhoto(ref)
    const dataUrl = blob ? await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    }) : null
    check()
    photos.push({ ref, dataUrl })
  }
  return { format: 'solemi-personal-export', version: 1, exportedAt, server,
    localDiary: { format: 'solemi-sleep-backup', version: 4, exportedAt, data }, photos,
    scope: 'Server account and currently accessible shared diary; this device current local diary and available profile photos. Excludes other devices, other accounts and authentication secrets.' }
}
