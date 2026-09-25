import { describe, expect, it } from 'vitest'
import { deviceToReplaceWhenKeeping } from './accountDeviceSelection'

describe('account device choice', () => {
  const devices = [{ id: 'old-phone' }, { id: 'other-phone' }]

  it('revokes the other old device when the user chooses one to keep alongside this phone', () => {
    expect(deviceToReplaceWhenKeeping(devices, 'other-phone')).toEqual({ id: 'old-phone' })
    expect(deviceToReplaceWhenKeeping(devices, 'old-phone')).toEqual({ id: 'other-phone' })
  })

  it('does not guess which device to revoke if the list is ambiguous or stale', () => {
    expect(deviceToReplaceWhenKeeping(devices, 'missing')).toBeNull()
    expect(deviceToReplaceWhenKeeping([devices[0]], 'old-phone')).toBeNull()
    expect(deviceToReplaceWhenKeeping([devices[0], devices[0]], 'old-phone')).toBeNull()
  })
})
