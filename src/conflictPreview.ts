import type { AppData } from './types'
import type { SyncConflict, getSyncStore } from './familySync'

type Store = ReturnType<typeof getSyncStore>
// Show the result of replaying pending local changes onto the reviewed family
// value, not stale untouched fields from the pre-conflict local snapshot.
export function conflictLocalValue(conflict: SyncConflict, pending: Store['pending']) {
  let value: Record<string, unknown> | null = { ...conflict.serverValue }
  for (const operation of pending.filter(op => conflict.entityType === 'CHILD'
    ? op.childId === conflict.entityId : op.sessionId === conflict.entityId)) {
    if (operation.method === 'DELETE') { value = null; continue }
    if (!value) continue
    if (operation.method === 'PATCH') value = { ...value, ...(operation.body.patch as object) }
    else if (operation.path.endsWith('/end')) value = { ...value, endTime: operation.body.endTime }
  }
  return value
}

export function conflictReviewKey(store: Store, data: AppData, operationId: string) {
  const conflict = store.conflicts.find(item => item.operationId === operationId)
  if (!conflict) return ''
  return JSON.stringify({ connection: store.connection, conflict,
    pending: store.pending.filter(op => conflict.entityType === 'CHILD'
      ? op.childId === conflict.entityId : op.sessionId === conflict.entityId),
    local: conflict.entityType === 'CHILD' ? data.children.find(c => c.id === conflict.entityId)
      : data.sessions.find(s => s.id === conflict.entityId) })
}

export const conflictCopy = {
  hu: { local: 'Helyi módosításokkal', family: 'Családi változat', child: 'Gyermek', start: 'Elalvás', end: 'Ébredés',
    note: 'Megjegyzés', type: 'Alvás típusa', name: 'Név', birthday: 'Születési dátum', absent: 'Nincs megadva',
    deleted: 'A helyi választás ezt a bejegyzést a családi naplóból is törli.', active: 'Jelenleg is alszik', automatic: 'Automatikus', day: 'Nappali', night: 'Éjszakai',
    previous: 'Előző konfliktus', next: 'Következő konfliktus', count: (n: number, total: number) => `${n}. konfliktus / ${total}`,
    help: 'A helyi választás a várakozó módosításokat tartja meg; a többi mező a családi változatból marad. A családi választás ennél a bejegyzésnél elveti a várakozó helyi módosításokat.',
    changed: 'A változat közben módosult. Nézd át újra, majd válassz.', different: 'Eltérő érték',
    date: 'Dátum', hour: 'Óra', minute: 'Perc' },
  en: { local: 'With local changes', family: 'Family version', child: 'Child', start: 'Fell asleep', end: 'Woke up',
    note: 'Note', type: 'Sleep type', name: 'Name', birthday: 'Date of birth', absent: 'Not provided',
    deleted: 'The local choice also deletes this entry from the family diary.', active: 'Still sleeping', automatic: 'Automatic', day: 'Daytime', night: 'Nighttime',
    previous: 'Previous conflict', next: 'Next conflict', count: (n: number, total: number) => `Conflict ${n} of ${total}`,
    help: 'The local choice keeps pending changes; other fields remain from the family version. The family choice discards pending local changes for this entry.',
    changed: 'The version has changed. Review it again before choosing.', different: 'Different value',
    date: 'Date', hour: 'Hour', minute: 'Minute' },
  de: { local: 'Mit lokalen Änderungen', family: 'Familienversion', child: 'Kind', start: 'Eingeschlafen', end: 'Aufgewacht',
    note: 'Notiz', type: 'Schlafart', name: 'Name', birthday: 'Geburtsdatum', absent: 'Nicht angegeben',
    deleted: 'Die lokale Auswahl löscht diesen Eintrag auch aus dem Familientagebuch.', active: 'Schläft noch', automatic: 'Automatisch', day: 'Tagsüber', night: 'Nachts',
    previous: 'Vorheriger Konflikt', next: 'Nächster Konflikt', count: (n: number, total: number) => `Konflikt ${n} von ${total}`,
    help: 'Die lokale Auswahl behält ausstehende Änderungen; andere Felder bleiben aus der Familienversion erhalten. Die Familienversion verwirft ausstehende lokale Änderungen für diesen Eintrag.',
    changed: 'Die Version hat sich geändert. Prüfe sie vor der Auswahl erneut.', different: 'Abweichender Wert',
    date: 'Datum', hour: 'Stunde', minute: 'Minute' }
} as const
