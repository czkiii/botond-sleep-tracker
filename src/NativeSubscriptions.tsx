import { useEffect, useState } from 'react'
import type { Locale } from './i18n'
import { nativeBilling } from './nativeBillingRuntime'
import type { StoreOffer } from './nativeBilling'

const copy = {
  hu: {
    title: 'Előfizetés', load: 'Csomagok megtekintése', restore: 'Vásárlások visszaállítása', manage: 'Előfizetés kezelése',
    month: 'hó', buy: 'Előfizetek', busy: 'Kapcsolódás az áruházhoz…', none: 'Jelenleg nincs elérhető csomag.',
    terms: 'Havi, automatikusan megújuló előfizetés. A vásárlást az áruházban hagyod jóvá, és ott mondhatod le. A Solemi-próba külön működik.',
    checked: 'A vásárlás ellenőrzése megtörtént, a hozzáférés frissült.', empty: 'Ehhez a Solemi-fiókhoz nem találtunk visszaállítható vásárlást.',
    pending: 'A vásárlás még jóváhagyásra vár. Jóváhagyás után újra ellenőrizzük.', cancelled: 'A vásárlást megszakítottad.',
    retry: 'Az ellenőrzés nem fejeződött be. Ne vásárolj újra; használd a Vásárlások visszaállítása gombot.',
    unavailable: 'A vásárlás még nincs beállítva vagy az áruház nem érhető el. Próbáld újra később.',
    changed: 'A fiók vagy az ár megváltozott. Töltsd be újra a csomagokat.',
    exists: 'Az áruházban már van előfizetésed vagy függő vásárlásod. Használd a visszaállítást vagy az előfizetés kezelését.'
  },
  en: {
    title: 'Subscription', load: 'View plans', restore: 'Restore purchases', manage: 'Manage subscription', month: 'month', buy: 'Subscribe',
    busy: 'Connecting to the store…', none: 'No plans are currently available.',
    terms: 'Monthly, automatically renewing subscription. Confirm and cancel through your app store. The Solemi trial is separate.',
    checked: 'Purchase verification completed and access refreshed.', empty: 'No restorable purchases were found for this Solemi account.',
    pending: 'The purchase is awaiting approval. We will check again after approval.', cancelled: 'Purchase cancelled.',
    retry: 'Verification did not complete. Do not purchase again; use Restore purchases.',
    unavailable: 'Purchases are not configured yet or the store is unavailable. Try again later.',
    changed: 'Your account or the price changed. Load the plans again.',
    exists: 'You already have a subscription or pending purchase in the store. Use Restore purchases or Manage subscription.'
  },
  de: {
    title: 'Abonnement', load: 'Pakete anzeigen', restore: 'Käufe wiederherstellen', manage: 'Abonnement verwalten', month: 'Monat', buy: 'Abonnieren',
    busy: 'Verbindung zum Store…', none: 'Derzeit sind keine Pakete verfügbar.',
    terms: 'Monatliches, automatisch verlängerndes Abonnement. Bestätigung und Kündigung erfolgen im App Store. Die Solemi-Testphase ist separat.',
    checked: 'Kaufprüfung abgeschlossen und Zugriff aktualisiert.', empty: 'Für dieses Solemi-Konto wurden keine wiederherstellbaren Käufe gefunden.',
    pending: 'Der Kauf wartet auf Genehmigung. Danach prüfen wir erneut.', cancelled: 'Kauf abgebrochen.',
    retry: 'Die Prüfung wurde nicht abgeschlossen. Nicht erneut kaufen; verwende Käufe wiederherstellen.',
    unavailable: 'Käufe sind noch nicht eingerichtet oder der Store ist nicht erreichbar. Versuche es später erneut.',
    changed: 'Konto oder Preis geändert. Lade die Pakete erneut.',
    exists: 'Im Store besteht bereits ein Abonnement oder ein ausstehender Kauf. Verwende Wiederherstellen oder Abonnement verwalten.'
  }
}

export default function NativeSubscriptions({ locale }: { locale: Locale }) {
  const c = copy[locale]
  const [offers, setOffers] = useState<StoreOffer[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setMessage('') }, [locale])
  const act = async (action: 'load' | 'restore' | 'manage' | 'buy', offer?: StoreOffer) => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const billing = await nativeBilling()
      if (action === 'load') {
        const available = await billing.offers(); setOffers(available)
        if (!available.length) setMessage(c.none)
      } else if (action === 'restore') {
        const result = await billing.recover(true)
        setMessage(result.failed ? c.retry : result.pending ? c.pending : result.verified ? c.checked : c.empty)
      } else if (action === 'manage') await billing.manage()
      else if (offer) { await billing.purchase(offer); setMessage(c.checked) }
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'PRICE_CHANGED' || code === 'ACCOUNT_CONTEXT_CHANGED') { setOffers([]); setMessage(c.changed) }
      else setMessage(code === 'SUBSCRIPTION_EXISTS' ? c.exists : code === 'PURCHASE_CANCELLED' ? c.cancelled : code === 'PURCHASE_PENDING' ? c.pending
        : action === 'buy' || action === 'restore' ? c.retry : c.unavailable)
    } finally { setBusy(false) }
  }
  return <section className="native-subscriptions" aria-label={c.title} aria-busy={busy}>
    <strong>{c.title}</strong>
    <button type="button" disabled={busy} onClick={() => void act('load')}>{c.load}</button>
    {offers.map(offer => <button type="button" disabled={busy} key={`${offer.productId}:${offer.basePlanId || ''}`} onClick={() => void act('buy', offer)}>
      {offer.product === 'FAMILY_PLUS' ? 'Family+' : 'Family'} · {offer.price}/{c.month} — {c.buy}
    </button>)}
    {offers.length > 0 && <small>{c.terms}</small>}
    <button type="button" disabled={busy} onClick={() => void act('restore')}>{c.restore}</button>
    <button type="button" disabled={busy} onClick={() => void act('manage')}>{c.manage}</button>
    <small role="status" aria-live="polite">{busy ? c.busy : message}</small>
  </section>
}
