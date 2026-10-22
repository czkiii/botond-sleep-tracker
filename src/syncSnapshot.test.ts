import { expect, it, vi } from 'vitest'
import { downloadSyncSnapshot } from './syncSnapshot'

it('bounds continuous concurrent changes to three complete attempts', async () => {
  const fetchPage = vi.fn(async (path: string) => {
    if (path.includes('offset=500')) throw Object.assign(new Error('changed'), { code: 'SYNC_SNAPSHOT_CHANGED' })
    return { revision: 4, sessions: Array.from({ length: 500 }, (_, id) => ({ id })), nextOffset: 500 }
  })
  await expect(downloadSyncSnapshot(0, fetchPage)).rejects.toMatchObject({ code: 'SYNC_SNAPSHOT_CHANGED' })
  expect(fetchPage).toHaveBeenCalledTimes(6)
})
it.each([0, -1, 499, 10001, NaN])('rejects a looping/invalid continuation %s', async nextOffset => {
  const fetchPage = vi.fn(async () => ({ revision: 4, sessions: Array(500).fill({}), nextOffset }))
  await expect(downloadSyncSnapshot(0, fetchPage)).rejects.toThrow('SYNC_SNAPSHOT_INVALID')
  expect(fetchPage).toHaveBeenCalledTimes(1)
})
it('accepts the exact 10000 row maximum when the final page ends', async () => {
  const fetchPage = vi.fn(async (path: string) => {
    const offset = Number(new URL(path, 'https://test').searchParams.get('offset'))
    return { revision: 4, sessions: Array(500).fill({}), nextOffset: offset < 9500 ? offset + 500 : null }
  })
  expect((await downloadSyncSnapshot(0, fetchPage)).sessions).toHaveLength(10000)
  expect(fetchPage).toHaveBeenCalledTimes(20)
})
it('does not keep following an unbounded snapshot', async () => {
  const fetchPage = vi.fn(async (path: string) => ({ revision: 4, sessions: Array(500).fill({}),
    nextOffset: Number(new URL(path, 'https://test').searchParams.get('offset')) + 500 }))
  await expect(downloadSyncSnapshot(0, fetchPage)).rejects.toThrow()
  expect(fetchPage).toHaveBeenCalledTimes(20)
})
