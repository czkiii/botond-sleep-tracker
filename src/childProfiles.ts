import type { AppData, ChildProfile } from './types'

// A draft can stay open while sync updates the displayed diary. Apply only the
// edited fields and reject conflicting changes instead of treating stale fields
// from that draft as new user intent.
export function mergeChildDraft(current: ChildProfile | undefined, original: ChildProfile, draft: ChildProfile): ChildProfile | null {
  if (!current || current.id !== original.id || draft.id !== original.id) return null
  const merged = { ...current, updatedAt: draft.updatedAt }
  for (const field of ['name', 'birthDate', 'photoRef'] as const) {
    if (draft[field] === original[field]) continue
    if (current[field] !== original[field] && current[field] !== draft[field]) return null
    // All three fields are string/null, with name additionally constrained to string.
    Object.assign(merged, { [field]: draft[field] })
  }
  return merged
}

export function removeChildProfile(data: AppData, childId: string): AppData | null {
  if (data.children.length <= 1 || !data.children.some((child) => child.id === childId)) return null

  const children = data.children.filter((child) => child.id !== childId)
  const activeChildId = data.settings.activeChildId === childId
    ? children[0].id
    : data.settings.activeChildId

  return {
    ...data,
    settings: { ...data.settings, activeChildId },
    children,
    sessions: data.sessions.filter((session) => session.childId !== childId)
  }
}
