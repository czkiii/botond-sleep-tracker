export type Locale = 'hu' | 'en' | 'de'

export const languageOptions: Array<{ value: Locale; flag: string; label: string }> = [
  { value: 'hu', flag: '🇭🇺', label: 'Magyar' },
  { value: 'en', flag: '🇬🇧', label: 'English' },
  { value: 'de', flag: '🇩🇪', label: 'Deutsch' }
]

export const localeTag = (locale: Locale) => locale === 'hu' ? 'hu-HU' : locale === 'de' ? 'de-DE' : 'en-GB'

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const language = navigator.language.toLowerCase()
  if (language.startsWith('hu')) return 'hu'
  if (language.startsWith('de')) return 'de'
  return 'en'
}

const translations = {
  hu: {
    settings: 'Beállítások', todaySoFar: 'Ma eddig', sleepNoun: 'alvás', sleeping: 'ALSZIK', awake: 'ÉBREN',
    fellAsleep: 'Elaludt', wokeUp: 'Felébredt', noPreviousWake: 'Nincs korábbi ébredés', manualEntry: 'Egyedi alvási idő rögzítése',
    todaySleeps: 'Mai alvások', yesterdaySleeps: 'Tegnapi alvások', noSleepToday: 'Még nincs mai alvás.', noSleepYesterday: 'Nem volt tegnap rögzített alvás.', now: 'most',
    history: 'Előzmények', noRecordedSleep: 'Még nincs rögzített alvás.', today: 'Ma', yesterday: 'Tegnap', edit: 'Szerkesztés', delete: 'Törlés',
    statistics: 'Statisztika', day: 'Nap', week: 'Hét', month: 'Hónap', sleepDuration: 'Alvás időtartama', sleep: 'Alvás', overview24h: '24 órás áttekintés', average: 'Átlag', perDay: '/ nap', daytime: 'Nappali', nighttime: 'Éjszakai', insights: 'Insights', wakeWindow: 'Ébrenléti ablak', awakeForNow: 'Ennyi ideje van ébren', typicalWakeWindow: 'Jellemző az elmúlt 14 napban', wakeWindowBasis: '{count} tiszta ébrenléti ablak alapján', wakeWindowCollecting: 'Még gyűjtjük a mintát ({count}/3)', wakeWindowUnavailable: 'Futó alvás közben az aktuális ébrenléti ablak nem számítható.', lowConfidence: 'Korai jelzés', mediumConfidence: 'Stabilabb minta', insightsExcluded: '{count} problémás bejegyzést kihagytunk a számításból.',
    babyName: 'Baba neve', babyNamePlaceholder: 'Baba neve', language: 'Nyelv', exportData: 'Adatok exportálása', importData: 'Adatok importálása', clearAll: 'Összes alvásadat törlése', localOnly: 'Az adatok jelenleg kizárólag ezen az eszközön maradnak.',
    children: 'Gyerekek', childrenHint: 'Profilok és születési dátumok', addChild: 'Gyerek hozzáadása', editChild: 'Profil szerkesztése', childName: 'Gyerek neve', childNamePlaceholder: 'Pl. Emma', childNameRequired: 'Add meg a gyerek nevét.', birthDate: 'Születési dátum', birthDateMissing: 'Nincs születési dátum', birthDateFuture: 'A születési dátum nem lehet jövőbeli.', birthDateAnalyticsHint: 'Ezt az életkorhoz igazított elemzésekhez használjuk.', optional: 'opcionális', unnamedChild: 'Névtelen profil', chooseChild: 'Gyerek kiválasztása', active: 'Aktív', sleepEntries: '{count} alvás',
    addPhoto: 'Profilkép hozzáadása', changePhoto: 'Profilkép cseréje', removePhoto: 'Eltávolítás', photoLocalHint: 'A profilkép ezen az eszközön marad.', photoInvalid: 'Válassz 12 MB-nál kisebb képfájlt.', photoSaveError: 'A profilképet nem sikerült elmenteni.', saving: 'Mentés…',
    longSleepReminder: '„Még alszik?” jelzés', longSleepReminderHint: '12 óránál hosszabb aktív alvásnál jelez. Soha nem zárja le automatikusan.', startedEarlier: 'Korábban aludt el:', customTime: 'Egyedi idő', stillSleepingQuestion: 'Még alszik?', longSleepReminderText: 'Ez az alvás több mint 12 órája tart. Ellenőrizd, hogy még fut-e.', checkSleepData: 'Ellenőrizd az alvásadatot', invalidTimeWarning: 'Az alvás időpontjai hibásak vagy hiányosak.', futureTimeWarning: 'Az alvás jövőbeli időpontot tartalmaz.', shortDurationWarning: 'Ez az alvás szokatlanul rövid.', staleActiveWarning: 'Egy aktív alvás több mint 12 órája fut.', duplicateWarning: 'Két bejegyzés valószínűleg ugyanazt az alvást rögzíti.', overlapWarning: 'Két alvás időben átfedi egymást.', extremeDurationWarning: 'Szokatlanul hosszú alvást találtam.',
    importFound: '{count} alvásbejegyzést találtam. Felülírjam a jelenlegi adatokat?', importError: 'Importálási hiba.', clearConfirm: 'Biztosan törlöd az összes alvásadatot? Ez nem vonható vissza.', deleteConfirm: 'Biztosan törlöd ezt az alvást?',
    details: 'Részletek', recordSleep: 'Alvás rögzítése', stillSleeping: 'Még alszik', note: 'Megjegyzés', optionalNote: 'Opcionális megjegyzés', save: 'Mentés',
    sleepType: 'Alvás típusa', automatic: 'Automatikus', automaticRule: 'Automatikusan nappali {dayStart}:00–{nightStart}:00 között, azon kívül éjszakai.',
    futureNotAllowed: 'Jövőbeli időpont nem menthető.', wakeAfterSleep: 'A felébredésnek később kell lennie, mint az elalvásnak.', activeExists: 'Már van egy futó alvás.',
    sleeps: 'Alvások', touchSegment: 'Érints meg egy alvási szakaszt a részletekhez', timelineAria: '24 órás alvási idővonal',
    invalidJson: 'A fájl nem érvényes JSON mentés.', invalidBackup: 'Érvénytelen mentés.', wrongBackup: 'Ez nem támogatott Solemi Sleep mentés.', corruptBackup: 'A mentés sérült vagy hiányos alvásadatot tartalmaz.'
  },
  en: {
    settings: 'Settings', todaySoFar: 'Today so far', sleepNoun: 'sleep', sleeping: 'ASLEEP', awake: 'AWAKE',
    fellAsleep: 'Fell asleep', wokeUp: 'Woke up', noPreviousWake: 'No previous wake time', manualEntry: 'Record custom sleep time',
    todaySleeps: "Today's sleep", yesterdaySleeps: "Yesterday's sleep", noSleepToday: 'No sleep recorded today yet.', noSleepYesterday: 'No sleep was recorded yesterday.', now: 'now',
    history: 'History', noRecordedSleep: 'No sleep recorded yet.', today: 'Today', yesterday: 'Yesterday', edit: 'Edit', delete: 'Delete',
    statistics: 'Statistics', day: 'Day', week: 'Week', month: 'Month', sleepDuration: 'Sleep duration', sleep: 'Sleep', overview24h: '24-hour overview', average: 'Average', perDay: '/ day', daytime: 'Daytime', nighttime: 'Nighttime', insights: 'Insights', wakeWindow: 'Wake window', awakeForNow: 'Awake for this long', typicalWakeWindow: 'Typical over the last 14 days', wakeWindowBasis: 'Based on {count} clean wake windows', wakeWindowCollecting: 'Still collecting a pattern ({count}/3)', wakeWindowUnavailable: 'The current wake window is unavailable while sleep is active.', lowConfidence: 'Early signal', mediumConfidence: 'Stronger pattern', insightsExcluded: '{count} problematic entries were excluded from this calculation.',
    babyName: "Baby's name", babyNamePlaceholder: "Baby's name", language: 'Language', exportData: 'Export data', importData: 'Import data', clearAll: 'Delete all sleep data', localOnly: 'Your data currently stays only on this device.',
    children: 'Children', childrenHint: 'Profiles and birth dates', addChild: 'Add child', editChild: 'Edit profile', childName: "Child's name", childNamePlaceholder: 'e.g. Emma', childNameRequired: "Enter the child's name.", birthDate: 'Birth date', birthDateMissing: 'No birth date', birthDateFuture: 'Birth date cannot be in the future.', birthDateAnalyticsHint: 'This is used for age-aware insights.', optional: 'optional', unnamedChild: 'Unnamed profile', chooseChild: 'Choose child', active: 'Active', sleepEntries: '{count} sleeps',
    addPhoto: 'Add profile photo', changePhoto: 'Change profile photo', removePhoto: 'Remove', photoLocalHint: 'The profile photo stays on this device.', photoInvalid: 'Choose an image smaller than 12 MB.', photoSaveError: 'The profile photo could not be saved.', saving: 'Saving…',
    longSleepReminder: '“Still sleeping?” reminder', longSleepReminderHint: 'Warn after 12 hours of active sleep. It never ends a sleep automatically.', startedEarlier: 'Fell asleep earlier:', customTime: 'Custom time', stillSleepingQuestion: 'Still sleeping?', longSleepReminderText: 'This sleep has been active for more than 12 hours. Check whether it is still running.', checkSleepData: 'Check sleep data', invalidTimeWarning: 'This sleep has invalid or incomplete times.', futureTimeWarning: 'This sleep contains a future time.', shortDurationWarning: 'This sleep is unusually short.', staleActiveWarning: 'An active sleep has been running for more than 12 hours.', duplicateWarning: 'Two entries probably describe the same sleep.', overlapWarning: 'Two sleep entries overlap in time.', extremeDurationWarning: 'An unusually long sleep was found.',
    importFound: 'I found {count} sleep entries. Replace the current data?', importError: 'Import error.', clearConfirm: 'Delete all sleep data? This cannot be undone.', deleteConfirm: 'Delete this sleep entry?',
    details: 'Details', recordSleep: 'Record sleep', stillSleeping: 'Still sleeping', note: 'Note', optionalNote: 'Optional note', save: 'Save',
    sleepType: 'Sleep type', automatic: 'Automatic', automaticRule: 'Automatically daytime from {dayStart}:00–{nightStart}:00, nighttime otherwise.',
    futureNotAllowed: 'A future time cannot be saved.', wakeAfterSleep: 'Wake time must be later than sleep time.', activeExists: 'There is already an active sleep.',
    sleeps: 'Sleep', touchSegment: 'Tap a sleep segment for details', timelineAria: '24-hour sleep timeline',
    invalidJson: 'The file is not a valid JSON backup.', invalidBackup: 'Invalid backup.', wrongBackup: 'This is not a supported Solemi Sleep backup.', corruptBackup: 'The backup contains damaged or incomplete sleep data.'
  },
  de: {
    settings: 'Einstellungen', todaySoFar: 'Heute bisher', sleepNoun: 'Schlaf', sleeping: 'SCHLÄFT', awake: 'WACH',
    fellAsleep: 'Eingeschlafen', wokeUp: 'Aufgewacht', noPreviousWake: 'Keine frühere Aufwachzeit', manualEntry: 'Eigene Schlafzeit eintragen',
    todaySleeps: 'Heutiger Schlaf', yesterdaySleeps: 'Gestriger Schlaf', noSleepToday: 'Heute wurde noch kein Schlaf erfasst.', noSleepYesterday: 'Gestern wurde kein Schlaf erfasst.', now: 'jetzt',
    history: 'Verlauf', noRecordedSleep: 'Noch kein Schlaf erfasst.', today: 'Heute', yesterday: 'Gestern', edit: 'Bearbeiten', delete: 'Löschen',
    statistics: 'Statistik', day: 'Tag', week: 'Woche', month: 'Monat', sleepDuration: 'Schlafdauer', sleep: 'Schlaf', overview24h: '24-Stunden-Übersicht', average: 'Durchschnitt', perDay: '/ Tag', daytime: 'Tagsüber', nighttime: 'Nachts', insights: 'Insights', wakeWindow: 'Wachfenster', awakeForNow: 'So lange bereits wach', typicalWakeWindow: 'Typisch in den letzten 14 Tagen', wakeWindowBasis: 'Basierend auf {count} sauberen Wachfenstern', wakeWindowCollecting: 'Muster wird noch gesammelt ({count}/3)', wakeWindowUnavailable: 'Während eines laufenden Schlafs ist das aktuelle Wachfenster nicht verfügbar.', lowConfidence: 'Frühes Signal', mediumConfidence: 'Stabileres Muster', insightsExcluded: '{count} problematische Einträge wurden aus der Berechnung ausgeschlossen.',
    babyName: 'Name des Babys', babyNamePlaceholder: 'Name des Babys', language: 'Sprache', exportData: 'Daten exportieren', importData: 'Daten importieren', clearAll: 'Alle Schlafdaten löschen', localOnly: 'Deine Daten bleiben derzeit ausschließlich auf diesem Gerät.',
    children: 'Kinder', childrenHint: 'Profile und Geburtsdaten', addChild: 'Kind hinzufügen', editChild: 'Profil bearbeiten', childName: 'Name des Kindes', childNamePlaceholder: 'z. B. Emma', childNameRequired: 'Gib den Namen des Kindes ein.', birthDate: 'Geburtsdatum', birthDateMissing: 'Kein Geburtsdatum', birthDateFuture: 'Das Geburtsdatum darf nicht in der Zukunft liegen.', birthDateAnalyticsHint: 'Dies wird für altersbezogene Einblicke verwendet.', optional: 'optional', unnamedChild: 'Unbenanntes Profil', chooseChild: 'Kind auswählen', active: 'Aktiv', sleepEntries: '{count} Schlafphasen',
    addPhoto: 'Profilbild hinzufügen', changePhoto: 'Profilbild ändern', removePhoto: 'Entfernen', photoLocalHint: 'Das Profilbild bleibt auf diesem Gerät.', photoInvalid: 'Wähle ein Bild unter 12 MB.', photoSaveError: 'Das Profilbild konnte nicht gespeichert werden.', saving: 'Speichern…',
    longSleepReminder: '„Schläft noch?“-Hinweis', longSleepReminderHint: 'Warnt nach 12 Stunden aktivem Schlaf. Der Schlaf wird nie automatisch beendet.', startedEarlier: 'Früher eingeschlafen:', customTime: 'Eigene Zeit', stillSleepingQuestion: 'Schläft noch?', longSleepReminderText: 'Dieser Schlaf läuft seit mehr als 12 Stunden. Prüfe, ob er noch aktiv ist.', checkSleepData: 'Schlafdaten prüfen', invalidTimeWarning: 'Dieser Schlaf hat ungültige oder unvollständige Zeiten.', futureTimeWarning: 'Dieser Schlaf enthält eine zukünftige Zeit.', shortDurationWarning: 'Dieser Schlaf ist ungewöhnlich kurz.', staleActiveWarning: 'Ein aktiver Schlaf läuft seit mehr als 12 Stunden.', duplicateWarning: 'Zwei Einträge beschreiben wahrscheinlich denselben Schlaf.', overlapWarning: 'Zwei Schlafeinträge überschneiden sich zeitlich.', extremeDurationWarning: 'Ein ungewöhnlich langer Schlaf wurde gefunden.',
    importFound: '{count} Schlafeinträge gefunden. Aktuelle Daten ersetzen?', importError: 'Importfehler.', clearConfirm: 'Alle Schlafdaten löschen? Dies kann nicht rückgängig gemacht werden.', deleteConfirm: 'Diesen Schlafeintrag löschen?',
    details: 'Details', recordSleep: 'Schlaf eintragen', stillSleeping: 'Schläft noch', note: 'Notiz', optionalNote: 'Optionale Notiz', save: 'Speichern',
    sleepType: 'Schlaftyp', automatic: 'Automatisch', automaticRule: 'Automatisch tagsüber von {dayStart}:00–{nightStart}:00, sonst nachts.',
    futureNotAllowed: 'Eine zukünftige Uhrzeit kann nicht gespeichert werden.', wakeAfterSleep: 'Die Aufwachzeit muss nach der Einschlafzeit liegen.', activeExists: 'Es gibt bereits einen laufenden Schlaf.',
    sleeps: 'Schlaf', touchSegment: 'Tippe auf einen Schlafabschnitt für Details', timelineAria: '24-Stunden-Schlafzeitleiste',
    invalidJson: 'Die Datei ist kein gültiges JSON-Backup.', invalidBackup: 'Ungültiges Backup.', wrongBackup: 'Dies ist kein unterstütztes Solemi Sleep Backup.', corruptBackup: 'Das Backup enthält beschädigte oder unvollständige Schlafdaten.'
  }
} as const

export type TranslationKey = keyof typeof translations.en

export function t(locale: Locale, key: TranslationKey, values?: Record<string, string | number>) {
  let text: string = translations[locale][key]
  if (values) Object.entries(values).forEach(([name, value]) => { text = text.replace(`{${name}}`, String(value)) })
  return text
}
