import { conflictCopy, conflictLocalValue } from './conflictPreview'
import type { SyncConflict, getSyncStore } from './familySync'
import type { AppData } from './types'
import { localeTag } from './i18n'

export function ConflictComparison({ conflict, data, pending }: {
  conflict: SyncConflict; data: AppData; pending: ReturnType<typeof getSyncStore>['pending']
}) {
  const text = conflictCopy[data.settings.locale]
  const local = conflictLocalValue(conflict, pending)
  const family = conflict.serverValue as unknown as Record<string, unknown>
  const format = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(localeTag(data.settings.locale), { year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(value)) : text.absent
  const fields = (value: Record<string, unknown>): Array<[string, string]> => conflict.entityType === 'CHILD'
    ? [[text.name, String(value.name || text.absent)], [text.birthday, String(value.birthDate || text.absent)]]
    : [[text.child, data.children.find(c => c.id === value.childId)?.name || text.absent],
      [text.start, format(value.startTime)], [text.end, value.endTime === null ? text.active : format(value.endTime)],
      [text.type, value.dayNightOverride === 'day' ? text.day : value.dayNightOverride === 'night' ? text.night : text.automatic],
      [text.note, String(value.note || text.absent)]]
  const familyFields = fields(family)
  const localFields = local ? fields(local) : []
  return <>
    <p>{text.help}</p>
    <div className="conflict-comparison">
      {([['local', text.local, localFields], ['family', text.family, familyFields]] as const).map(([key, label, rows]) =>
        <section className="conflict-version" key={key} aria-label={label}>
          <h3>{label}</h3>
          {key === 'local' && !local ? <p className="conflict-deletion">{text.deleted}</p> : <dl>
            {rows.map(([field, value], index) => {
              const changed = !local || localFields[index]?.[1] !== familyFields[index]?.[1]
              return <div key={field} className={changed ? 'conflict-field changed' : 'conflict-field'}>
                <dt>{field}{changed && <span className="sr-only"> — {text.different}</span>}</dt><dd>{value}</dd>
              </div>
            })}
          </dl>}
        </section>)}
    </div>
  </>
}
