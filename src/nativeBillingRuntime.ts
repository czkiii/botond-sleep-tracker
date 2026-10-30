import { Capacitor } from '@capacitor/core'
import { ACCOUNT_STATE_EVENT, accountBillingContext, accountRequest, getAccountAccess } from './accountAuth'
import { NativeBilling, NativeBillingError } from './nativeBilling'

export function nativeBillingEnabled() {
  return import.meta.env.VITE_NATIVE_APP === 'true' && import.meta.env.VITE_NATIVE_BILLING === 'true'
    && Capacitor.isNativePlatform() && ['ios', 'android'].includes(Capacitor.getPlatform())
}
let instance: Promise<NativeBilling> | undefined
export function nativeBilling() {
  // The dependency has a web mock. Never invoke it in a browser or PWA.
  if (!nativeBillingEnabled()) return Promise.reject(new NativeBillingError('NATIVE_BILLING_UNAVAILABLE'))
  instance ??= import('@capgo/native-purchases').then(({ NativePurchases }) => new NativeBilling({
    platform: Capacitor.getPlatform() as 'ios' | 'android', store: NativePurchases,
    context: accountBillingContext,
    post: (path, body) => accountRequest(path, { method: 'POST', body: JSON.stringify(body) }),
    refreshAccess: getAccountAccess
  }))
  return instance
}

let started = false
export async function startNativeBillingRecovery() {
  if (started || !nativeBillingEnabled()) return
  started = true
  const { NativePurchases } = await import('@capgo/native-purchases')
  await NativePurchases.configure({ autoFinishTransactions: false })
  let timer: ReturnType<typeof setTimeout> | undefined
  let busyRetries = 0
  const recover = async () => {
    if (!navigator.onLine || !accountBillingContext() || document.visibilityState === 'hidden') return
    try { await (await nativeBilling()).recover(); busyRetries = 0 }
    catch (error) {
      // No receipt data/error messages in logs. Retry a busy native sheet briefly;
      // network failures wait for online/foreground/explicit Restore.
      if (error instanceof NativeBillingError && error.code === 'BILLING_BUSY' && busyRetries++ < 6) {
        timer = setTimeout(() => void recover(), 5000)
      }
    }
  }
  const schedule = () => { clearTimeout(timer); busyRetries = 0; timer = setTimeout(() => void recover(), 500) }
  if (Capacitor.getPlatform() === 'ios') await NativePurchases.addListener('transactionUpdated', schedule)
  window.addEventListener(ACCOUNT_STATE_EVENT, schedule)
  window.addEventListener('online', schedule)
  window.addEventListener('focus', schedule)
  document.addEventListener('visibilitychange', schedule)
  schedule()
}
