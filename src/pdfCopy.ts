export const pdfCopy = {
  hu: {
    title: 'Alvásnapló PDF', child: 'Gyermek', from: 'Első nap', to: 'Utolsó nap', notes: 'Megjegyzések belefoglalása',
    create: 'PDF letöltése', busy: 'PDF készítése…', cancel: 'Mégse', locked: 'Family vagy Family+ jogosultsággal érhető el, a családtagtól kapott jogosultsággal is.',
    intro: 'A kiválasztott gyermek ezen az eszközön elérhető naplója. A PDF olvasásra és megosztásra való; visszaállításhoz az Adatok exportálása gomb JSON-mentését használd.',
    privacy: 'A fájl tartalmazza a gyermek nevét és alvásadatait. A megjegyzések csak akkor kerülnek bele, ha kéred. A PDF ezen az eszközön készül.',
    range: 'Időszak', generated: 'Készült', zone: 'Időzóna', entries: 'Bejegyzések', total: 'Rögzített alvás az időszakban', active: 'Jelenleg is alszik',
    start: 'Elalvás', end: 'Ébredés', duration: 'Időszakba eső rész', type: 'Beállított típus', automatic: 'Automatikus', day: 'Nappali', night: 'Éjszakai', note: 'Megjegyzés',
    explanation: 'Az összidő az időszakba eső rögzített alvás, az átfedéseket egyszer számolva. A folyamatban lévő alvás a készítés idejéig számít. A sorok eredeti időpontokat mutatnak; az időtartam csak a választott időszakra vonatkozik.',
    disclaimer: 'A hiányzó bejegyzés nem jelent nulla alvást. Ez naplókivonat, nem orvosi értékelés vagy visszaállítható biztonsági mentés.',
    empty: 'Ebben az időszakban nincs rögzített alvás.', omitted: 'Érvénytelen időpont miatt kihagyott bejegyzések',
    symbols: 'A betűtípusból hiányzó jeleket [U+…] Unicode-kód jelöli.', continued: 'folytatás', unnamed: 'Névtelen profil',
    invalid: 'Válassz érvényes időszakot: legfeljebb 366 nap, a mai napig.', large: 'Ehhez a PDF-hez túl sok adat tartozik. Válassz rövidebb időszakot, vagy hagyd ki a megjegyzéseket.',
    denied: 'A PDF-jogosultság nem igazolható. Ellenőrizd a bejelentkezést és a hozzáférést, majd próbáld újra.', changed: 'Közben megváltozott a fiók vagy a napló. Nyisd meg újra az exportot.',
    failed: 'A PDF nem készült el. Próbáld újra; offline használathoz előbb töltsd be az appot internetkapcsolattal.', done: 'A PDF elkészült, a letöltés elindult.', hour: 'ó', minute: 'p', second: 'mp'
  },
  en: {
    title: 'Sleep diary PDF', child: 'Child', from: 'First day', to: 'Last day', notes: 'Include notes',
    create: 'Download PDF', busy: 'Creating PDF…', cancel: 'Cancel', locked: 'Available with Family or Family+, including access shared by a family member.',
    intro: 'The selected child’s diary available on this device. The PDF is for reading and sharing; use the JSON backup from Export data to restore a diary.',
    privacy: 'The file contains the child’s name and sleep data. Notes are included only if you choose. The PDF is created on this device.',
    range: 'Period', generated: 'Created', zone: 'Time zone', entries: 'Entries', total: 'Recorded sleep in this period', active: 'Still sleeping',
    start: 'Fell asleep', end: 'Woke up', duration: 'Part within period', type: 'Selected type', automatic: 'Automatic', day: 'Daytime', night: 'Nighttime', note: 'Note',
    explanation: 'The total includes recorded sleep within the period, counting overlaps once. Ongoing sleep is counted up to creation time. Rows show original times; durations cover only the selected period.',
    disclaimer: 'Missing entries do not mean zero sleep. This is a diary extract, not a medical assessment or a restorable backup.',
    empty: 'No recorded sleep in this period.', omitted: 'Entries omitted because of invalid times',
    symbols: 'Characters unavailable in the font are shown as [U+…] Unicode codes.', continued: 'continued', unnamed: 'Unnamed profile',
    invalid: 'Choose a valid period: up to 366 days, ending no later than today.', large: 'There is too much data for this PDF. Choose a shorter period or exclude notes.',
    denied: 'PDF access could not be verified. Check your sign-in and access, then try again.', changed: 'The account or diary changed. Reopen the export.',
    failed: 'The PDF could not be created. Try again; for offline use, first load the app with an internet connection.', done: 'The PDF is ready and the download has started.', hour: 'h', minute: 'min', second: 's'
  },
  de: {
    title: 'Schlaftagebuch als PDF', child: 'Kind', from: 'Erster Tag', to: 'Letzter Tag', notes: 'Notizen einschließen',
    create: 'PDF herunterladen', busy: 'PDF wird erstellt…', cancel: 'Abbrechen', locked: 'Mit Family oder Family+ verfügbar, auch über den Zugang eines Familienmitglieds.',
    intro: 'Das auf diesem Gerät verfügbare Tagebuch des ausgewählten Kindes. Das PDF dient zum Lesen und Teilen. Zum Wiederherstellen nutze die JSON-Sicherung unter Daten exportieren.',
    privacy: 'Die Datei enthält den Namen des Kindes und Schlafdaten. Notizen werden nur auf Wunsch eingeschlossen. Das PDF wird auf diesem Gerät erstellt.',
    range: 'Zeitraum', generated: 'Erstellt', zone: 'Zeitzone', entries: 'Einträge', total: 'Erfasster Schlaf im Zeitraum', active: 'Schläft noch',
    start: 'Eingeschlafen', end: 'Aufgewacht', duration: 'Anteil im Zeitraum', type: 'Gewählte Schlafart', automatic: 'Automatisch', day: 'Tagsüber', night: 'Nachts', note: 'Notiz',
    explanation: 'Die Gesamtzeit enthält erfassten Schlaf im Zeitraum; Überschneidungen zählen einmal. Laufender Schlaf zählt bis zur Erstellung. Die Zeilen zeigen ursprüngliche Zeiten, die Dauer nur den Anteil im gewählten Zeitraum.',
    disclaimer: 'Fehlende Einträge bedeuten nicht null Schlaf. Dies ist ein Tagebuchauszug, keine medizinische Bewertung oder wiederherstellbare Sicherung.',
    empty: 'Kein Schlaf in diesem Zeitraum erfasst.', omitted: 'Wegen ungültiger Zeiten ausgelassene Einträge',
    symbols: 'Nicht verfügbare Schriftzeichen werden als [U+…]-Unicode-Codes angezeigt.', continued: 'Fortsetzung', unnamed: 'Unbenanntes Profil',
    invalid: 'Wähle einen gültigen Zeitraum: höchstens 366 Tage, spätestens bis heute.', large: 'Zu viele Daten für dieses PDF. Wähle einen kürzeren Zeitraum oder lasse Notizen weg.',
    denied: 'Der PDF-Zugang konnte nicht bestätigt werden. Prüfe Anmeldung und Zugang und versuche es erneut.', changed: 'Konto oder Tagebuch hat sich geändert. Öffne den Export erneut.',
    failed: 'Das PDF konnte nicht erstellt werden. Versuche es erneut. Lade die App für die Offline-Nutzung zuerst mit Internetverbindung.', done: 'Das PDF ist fertig, der Download wurde gestartet.', hour: 'Std.', minute: 'Min.', second: 'Sek.'
  }
} as const
