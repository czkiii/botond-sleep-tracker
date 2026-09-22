export function deviceToReplaceWhenKeeping<T extends { id: string }>(devices: readonly T[], keptId: string): T | null {
  if (devices.length !== 2 || devices[0].id === devices[1].id) return null
  if (devices[0].id === keptId) return devices[1]
  if (devices[1].id === keptId) return devices[0]
  return null
}
