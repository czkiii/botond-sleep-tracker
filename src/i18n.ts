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
    statistics: 'Statisztika', day: 'Nap', week: 'Hét', month: 'Hónap', sleepDuration: 'Alvás időtartama', sleep: 'Alvás', overview24h: '24 órás áttekintés', average: 'Átlag', perDay: '/ nap', daytime: 'Nappali', nighttime: 'Éjszakai',
    babyName: 'Baba neve', babyNamePlaceholder: 'Baba neve', language: 'Nyelv', exportData: 'Adatok exportálása', importData: 'Adatok importálása', clearAll: 'Összes adat törlése', localOnly: 'Az adatok jelenleg kizárólag ezen az eszközön maradnak.',
    importFound: '{count} alvásbejegyzést találtam. Felülírjam a jelenlegi adatokat?', importError: 'Importálási hiba.', clearConfirm: 'Biztosan törlöd az összes alvásadatot? Ez nem vonható vissza.', deleteConfirm: 'Biztosan törlöd ezt az alvást?',
    details: 'Részletek', recordSleep: 'Alvás rögzítése', stillSleeping: 'Még alszik', note: 'Megjegyzés', optionalNote: 'Opcionális megjegyzés', save: 'Mentés',
    futureNotAllowed: 'Jövőbeli időpont nem menthető.', wakeAfterSleep: 'A felébredésnek később kell lennie, mint az elalvásnak.', activeExists: 'Már van egy futó alvás.',
    sleeps: 'Alvások', touchSegment: 'Érints meg egy alvási szakaszt a részletekhez', timelineAria: '24 órás alvási idővonal',
    invalidJson: 'A fájl nem érvényes JSON mentés.', invalidBackup: 'Érvénytelen mentés.', wrongBackup: 'Ez nem támogatott Baby Sleep Tracker mentés.', corruptBackup: 'A mentés sérült vagy hiányos alvásadatot tartalmaz.'
  },
  en: {
    settings: 'Settings', todaySoFar: 'Today so far', sleepNoun: 'sleep', sleeping: 'ASLEEP', awake: 'AWAKE',
    fellAsleep: 'Fell asleep', wokeUp: 'Woke up', noPreviousWake: 'No previous wake time', manualEntry: 'Record custom sleep time',
    todaySleeps: "Today's sleep", yesterdaySleeps: "Yesterday's sleep", noSleepToday: 'No sleep recorded today yet.', noSleepYesterday: 'No sleep was recorded yesterday.', now: 'now',
    history: 'History', noRecordedSleep: 'No sleep recorded yet.', today: 'Today', yesterday: 'Yesterday', edit: 'Edit', delete: 'Delete',
    statistics: 'Statistics', day: 'Day', week: 'Week', month: 'Month', sleepDuration: 'Sleep duration', sleep: 'Sleep', overview24h: '24-hour overview', average: 'Average', perDay: '/ day', daytime: 'Daytime', nighttime: 'Nighttime',
    babyName: "Baby's name", babyNamePlaceholder: "Baby's name", language: 'Language', exportData: 'Export data', importData: 'Import data', clearAll: 'Delete all data', localOnly: 'Your data currently stays only on this device.',
    importFound: 'I found {count} sleep entries. Replace the current data?', importError: 'Import error.', clearConfirm: 'Delete all sleep data? This cannot be undone.', deleteConfirm: 'Delete this sleep entry?',
    details: 'Details', recordSleep: 'Record sleep', stillSleeping: 'Still sleeping', note: 'Note', optionalNote: 'Optional note', save: 'Save',
    futureNotAllowed: 'A future time cannot be saved.', wakeAfterSleep: 'Wake time must be later than sleep time.', activeExists: 'There is already an active sleep.',
    sleeps: 'Sleep', touchSegment: 'Tap a sleep segment for details', timelineAria: '24-hour sleep timeline',
    invalidJson: 'The file is not a valid JSON backup.', invalidBackup: 'Invalid backup.', wrongBackup: 'This is not a supported Baby Sleep Tracker backup.', corruptBackup: 'The backup contains damaged or incomplete sleep data.'
  },
  de: {
    settings: 'Einstellungen', todaySoFar: 'Heute bisher', sleepNoun: 'Schlaf', sleeping: 'SCHLÄFT', awake: 'WACH',
    fellAsleep: 'Eingeschlafen', wokeUp: 'Aufgewacht', noPreviousWake: 'Keine frühere Aufwachzeit', manualEntry: 'Eigene Schlafzeit eintragen',
    todaySleeps: 'Heutiger Schlaf', yesterdaySleeps: 'Gestriger Schlaf', noSleepToday: 'Heute wurde noch kein Schlaf erfasst.', noSleepYesterday: 'Gestern wurde kein Schlaf erfasst.', now: 'jetzt',
    history: 'Verlauf', noRecordedSleep: 'Noch kein Schlaf erfasst.', today: 'Heute', yesterday: 'Gestern', edit: 'Bearbeiten', delete: 'Löschen',
    statistics: 'Statistik', day: 'Tag', week: 'Woche', month: 'Monat', sleepDuration: 'Schlafdauer', sleep: 'Schlaf', overview24h: '24-Stunden-Übersicht', average: 'Durchschnitt', perDay: '/ Tag', daytime: 'Tagsüber', nighttime: 'Nachts',
    babyName: 'Name des Babys', babyNamePlaceholder: 'Name des Babys', language: 'Sprache', exportData: 'Daten exportieren', importData: 'Daten importieren', clearAll: 'Alle Daten löschen', localOnly: 'Deine Daten bleiben derzeit ausschließlich auf diesem Gerät.',
    importFound: '{count} Schlafeinträge gefunden. Aktuelle Daten ersetzen?', importError: 'Importfehler.', clearConfirm: 'Alle Schlafdaten löschen? Dies kann nicht rückgängig gemacht werden.', deleteConfirm: 'Diesen Schlafeintrag löschen?',
    details: 'Details', recordSleep: 'Schlaf eintragen', stillSleeping: 'Schläft noch', note: 'Notiz', optionalNote: 'Optionale Notiz', save: 'Speichern',
    futureNotAllowed: 'Eine zukünftige Uhrzeit kann nicht gespeichert werden.', wakeAfterSleep: 'Die Aufwachzeit muss nach der Einschlafzeit liegen.', activeExists: 'Es gibt bereits einen laufenden Schlaf.',
    sleeps: 'Schlaf', touchSegment: 'Tippe auf einen Schlafabschnitt für Details', timelineAria: '24-Stunden-Schlafzeitleiste',
    invalidJson: 'Die Datei ist kein gültiges JSON-Backup.', invalidBackup: 'Ungültiges Backup.', wrongBackup: 'Dies ist kein unterstütztes Baby Sleep Tracker Backup.', corruptBackup: 'Das Backup enthält beschädigte oder unvollständige Schlafdaten.'
  }
} as const

export type TranslationKey = keyof typeof translations.en

export function t(locale: Locale, key: TranslationKey, values?: Record<string, string | number>) {
  let text: string = translations[locale][key]
  if (values) Object.entries(values).forEach(([name, value]) => { text = text.replace(`{${name}}`, String(value)) })
  return text
}
