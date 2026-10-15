import type { Locale } from './i18n'

const copy = {
  hu: {
    cleanup: 'A szerver elfogadta a törlést. A helyi adatok eltávolításának befejezése még szükséges; próbáld újra.',
    title: 'Fiókom és adataim', export: 'Fiókadatok letöltése', localExport: 'Helyi napló letöltése',
    exportHint: 'A fiókexport a szerveres fiókadataidat és közös naplódat, valamint ennek az eszköznek a helyi naplóját és elérhető profilképeit tartalmazza. Más eszközök helyi adatait külön kell lementened. A teljes csomag közvetlenül nem importálható; a helyi napló külön letöltése visszaállítható mentést ad.',
    continue: 'Folytatás a törléshez', immediate: 'Végleges törlés most', recovery: '30 napos helyreállítás',
    explanation: 'A szerveres hozzáférésed minden eszközön megszűnik. Más családtagok közös naplója megmarad. Ha te vagy az utolsó tag, a családi napló is törlődik, vagy a választott 30 napos helyreállítás végéig szünetel.',
    retention: 'A korábban felhasznált 7 napos próba ugyanazzal a Google-belépéssel új regisztráció után sem indul újra. Ehhez minimális trialjelölést őrzünk az egyszeri trialprogram fennállásáig, évente felülvizsgálva a szükségességét. A családi próbakeret sem nullázódik. A szükséges előfizetési és törlési nyilvántartás külön megmarad. A fióktörlés nem mondja le az áruházi előfizetést.',
    local: 'Az azonnali törlés ezen a készüléken a fiók helyi naplóját is eltávolítja. A 30 napos mód helyben megőrzi, de kijelentkeztet. Más eszközök offline másolatai és korábban letöltött fájlok nem törölhetők innen.',
    family: 'Az utolsó tag vagy. Megerősítésként írd be a család nevét:', confirm: 'Megértettem a törlés következményeit.',
    cancel: 'Mégse', retry: 'Frissítés és újrapróbálás', error: 'A művelet nem fejeződött be, vagy az adatok közben megváltoztak. Frissítsd az előnézetet. Ha már elindult a törlés, Google-belépéssel ellenőrizheted az állapotát.',
    pending: 'A fiók normál használata szünetel. A helyreállítás határideje:', restore: 'Fiókom helyreállítása',
    recoveryHint: 'A 30 nap maximum, nem kötelező várakozás. A régi belépések nem élednek újra. Másokkal közös családba új meghívó kell; az előfizetést újra ellenőrizzük.',
    done: 'A művelet sikerült. Helyreállítás után jelentkezz be újra.', busy: 'Feldolgozás…', subscriptionApple: 'Apple-előfizetés kezelése', subscriptionGoogle: 'Google-előfizetés kezelése'
  },
  en: {
    cleanup: 'The server accepted the deletion. Local data cleanup still needs to finish; please retry.',
    title: 'My account and data', export: 'Download account data', localExport: 'Download local diary',
    exportHint: 'The account export includes your server account data and shared diary, plus this device’s local diary and available profile photos. Back up other devices separately. The complete bundle cannot be imported directly; the separate local diary download provides a restorable backup.',
    continue: 'Continue to deletion', immediate: 'Delete permanently now', recovery: '30-day recovery',
    explanation: 'Your server access ends on every device. The shared diary remains for other family members. If you are the last member, the family diary is also deleted or suspended until your chosen 30-day recovery ends.',
    retention: 'A previously used 7-day trial does not restart when you register again with the same Google sign-in. We retain a minimal trial-use marker while the one-time trial programme exists, reviewing its necessity annually. The family trial allowance does not reset either. Necessary subscription and deletion records remain separately. Account deletion does not cancel your store subscription.',
    local: 'Immediate deletion also removes this account’s local diary on this device. Recovery keeps it locally but signs you out. Offline copies on other devices and previously downloaded files cannot be removed from here.',
    family: 'You are the last member. Confirm by entering the family name:', confirm: 'I understand the consequences of deletion.',
    cancel: 'Cancel', retry: 'Refresh and retry', error: 'The operation did not finish, or data changed. Refresh the preview. If deletion already started, sign in with Google to check its status.',
    pending: 'Normal account use is suspended. Recovery deadline:', restore: 'Restore my account',
    recoveryHint: '30 days is a maximum, not a required wait. Old sessions stay revoked. A shared family requires a new invitation; subscriptions must be checked again.',
    done: 'The operation succeeded. Sign in again after recovery.', busy: 'Processing…', subscriptionApple: 'Manage Apple subscription', subscriptionGoogle: 'Manage Google subscription'
  },
  de: {
    cleanup: 'Der Server hat die Löschung angenommen. Die Bereinigung lokaler Daten muss noch abgeschlossen werden; bitte erneut versuchen.',
    title: 'Mein Konto und meine Daten', export: 'Kontodaten herunterladen', localExport: 'Lokales Tagebuch herunterladen',
    exportHint: 'Der Kontoexport enthält deine Server-Kontodaten und das gemeinsame Tagebuch sowie das lokale Tagebuch und verfügbare Profilbilder dieses Geräts. Sichere andere Geräte separat. Das Gesamtpaket ist nicht direkt importierbar; der separate Tagebuchdownload ist eine wiederherstellbare Sicherung.',
    continue: 'Weiter zur Löschung', immediate: 'Jetzt endgültig löschen', recovery: '30 Tage Wiederherstellung',
    explanation: 'Dein Serverzugriff endet auf allen Geräten. Das gemeinsame Tagebuch bleibt für andere Familienmitglieder erhalten. Als letztes Mitglied löschst du auch das Familientagebuch oder setzt es bis zum Ende der gewählten 30 Tage aus.',
    retention: 'Eine bereits genutzte 7-tägige Testphase beginnt bei einer erneuten Registrierung mit derselben Google-Anmeldung nicht erneut. Dafür speichern wir einen minimalen Nachweis der Testnutzung, solange das einmalige Testprogramm besteht, und prüfen seine Erforderlichkeit jährlich. Auch das Testkontingent der Familie wird nicht zurückgesetzt. Notwendige Abo- und Löschaufzeichnungen bleiben separat bestehen. Die Kontolöschung kündigt kein Store-Abonnement.',
    local: 'Die sofortige Löschung entfernt auch das lokale Kontotagebuch auf diesem Gerät. Die Wiederherstellung behält es lokal, meldet dich aber ab. Offline-Kopien anderer Geräte und heruntergeladene Dateien können hier nicht gelöscht werden.',
    family: 'Du bist das letzte Mitglied. Gib zur Bestätigung den Familiennamen ein:', confirm: 'Ich verstehe die Folgen der Löschung.',
    cancel: 'Abbrechen', retry: 'Aktualisieren und erneut versuchen', error: 'Der Vorgang wurde nicht abgeschlossen oder Daten haben sich geändert. Aktualisiere die Vorschau. Wenn die Löschung bereits begann, melde dich mit Google an, um den Status zu prüfen.',
    pending: 'Die normale Kontonutzung ist ausgesetzt. Wiederherstellung möglich bis:', restore: 'Mein Konto wiederherstellen',
    recoveryHint: '30 Tage sind ein Maximum, keine Wartepflicht. Alte Sitzungen bleiben gesperrt. Eine gemeinsame Familie erfordert eine neue Einladung; Abonnements werden erneut geprüft.',
    done: 'Der Vorgang war erfolgreich. Melde dich nach der Wiederherstellung erneut an.', busy: 'Wird verarbeitet…', subscriptionApple: 'Apple-Abonnement verwalten', subscriptionGoogle: 'Google-Abonnement verwalten'
  }
} as const
export function accountDeletionCopy(locale: Locale) { return copy[locale] }
