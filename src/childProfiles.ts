import type { AppData } from './types'

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
