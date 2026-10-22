import { useRef, useState } from 'react'
import { accountRequest, finishAccountDeletion, recoverDeletedAccount } from './accountAuth'
import { deleteChildPhoto } from './photoStore'
import { removeAccountWorkspace, flushPhotoErasure, getActiveAccountWorkspaceId } from './accountWorkspace'
import { accountDataExport } from './accountDataExport'
import { exportData, loadData } from './storage'
import { accountDeletionCopy } from './accountDeletionCopy'
import { localeTag } from './i18n'
import type { Locale } from './i18n'

type Preview = { accountId: string; family: null | { id: string; name: string; revision: number; members: number } }
export type RecoveryState = { accountId: string; recoveryToken: string; recoverUntil: number }
export function AccountRecovery({ locale, recovery, onDone }: { locale: Locale; recovery: RecoveryState; onDone: () => void }) {
  const c = accountDeletionCopy(locale), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const finalized = useRef(false)
  const act = async (action: 'restore' | 'finalize') => {
    if (action === 'finalize' && !window.confirm(c.immediate + '?')) return
    setBusy(true); setError(false)
    try {
      if (!finalized.current) {
        await recoverDeletedAccount(recovery.recoveryToken, action)
        finalized.current = action === 'finalize'
      }
      if (action === 'finalize') { removeAccountWorkspace(recovery.accountId); await flushPhotoErasure(deleteChildPhoto) }
      onDone()
    }
    catch { setError(true) } finally { setBusy(false) }
  }
  return <div className="account-signout-choice account-data-controls" aria-busy={busy}>
    <p>{c.pending} {new Date(recovery.recoverUntil).toLocaleString(localeTag(locale))}</p><p>{c.recoveryHint}</p>
    <button disabled={busy || finalized.current || Date.now() >= recovery.recoverUntil} onClick={() => void act('restore')}>{c.restore}</button>
    <button disabled={busy} className="danger" onClick={() => void act('finalize')}>{c.immediate}</button>
    {error && <p role="alert">{finalized.current ? c.cleanup : c.error}</p>}
  </div>
}

export default function AccountDataControls({ locale, accountId, onDeleted }: { locale: Locale; accountId: string; onDeleted: () => void }) {
  const c = accountDeletionCopy(locale), [open, setOpen] = useState(false), [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [confirmed, setConfirmed] = useState(false), [familyName, setFamilyName] = useState('')
  const accepted = useRef<'IMMEDIATE' | 'RECOVERY' | null>(null)
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(false); try { await action() } catch { setError(true) } finally { setBusy(false) } }
  const refresh = () => run(async () => { setConfirmed(false); setFamilyName(''); setPreview(await accountRequest<Preview>('/v1/auth/account/deletion-preview')) })
  const download = () => run(async () => {
    const data = await accountDataExport(accountId)
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'solemi-account-data.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  const erase = (mode: 'IMMEDIATE' | 'RECOVERY') => run(async () => {
    if (!preview || preview.accountId !== accountId || !confirmed) return
    if (!accepted.current) {
      await accountRequest('/v1/auth/account/delete', { method: 'POST', body: JSON.stringify({ mode, preview, familyName }) })
      accepted.current = mode
    }
    if (getActiveAccountWorkspaceId() === accountId) finishAccountDeletion(accountId, accepted.current === 'IMMEDIATE')
    else if (accepted.current === 'IMMEDIATE') removeAccountWorkspace(accountId)
    await flushPhotoErasure(deleteChildPhoto)
    onDeleted()
  })
  if (!open) return <button type="button" className="account-signout" onClick={() => setOpen(true)}>{c.title}</button>
  if (accepted.current) return <section className="account-signout-choice account-data-controls" aria-busy={busy}>
    <p role="status">{c.cleanup}</p><button disabled={busy} onClick={() => void erase(accepted.current!)}>{c.retry}</button>
  </section>
  return <section className="account-signout-choice account-data-controls" aria-label={c.title} aria-busy={busy}>
    <h3>{c.title}</h3><p>{c.exportHint}</p>
    <button disabled={busy} onClick={() => void download()}>{c.export}</button>
    <button disabled={busy} onClick={() => { try { exportData(loadData()) } catch { setError(true) } }}>{c.localExport}</button>
    {!preview && <button disabled={busy} onClick={() => void refresh()}>{c.continue}</button>}
    {preview && <><p>{c.explanation}</p><p>{c.retention}</p><p>{c.local}</p>
      <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer">{c.subscriptionApple}</a>
      <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">{c.subscriptionGoogle}</a>
      {preview.family?.members === 1 && <label>{c.family} <strong>{preview.family.name}</strong>
        <input value={familyName} disabled={busy} onChange={e => setFamilyName(e.target.value)} autoComplete="off" /></label>}
      <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{c.confirm}</label>
      {(['IMMEDIATE', 'RECOVERY'] as const).map(mode => <button key={mode} className={mode === 'IMMEDIATE' ? 'danger' : ''}
        disabled={busy || !confirmed || (preview.family?.members === 1 && familyName !== preview.family.name)} onClick={() => void erase(mode)}>
        {mode === 'IMMEDIATE' ? c.immediate : c.recovery}</button>)}
    </>}
    {busy && <p role="status">{c.busy}</p>}
    {error && <><p role="alert">{c.error}</p><button disabled={busy} onClick={() => void refresh()}>{c.retry}</button></>}
    <button disabled={busy} onClick={() => { setOpen(false); setPreview(null); setConfirmed(false); setFamilyName(''); setError(false) }}>{c.cancel}</button>
  </section>
}
