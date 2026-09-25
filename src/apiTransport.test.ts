import { afterEach, expect, it, vi } from 'vitest'
import { API_TIMEOUT_MS, fetchJson } from './apiTransport'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('bounds a hung request and aborts it so the serialized sync queue can retry', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_url, options) => {
    signal = options.signal
    return new Promise(() => {})
  }))
  const checked = expect(fetchJson('/local-test')).rejects.toMatchObject({ code: 'API_TIMEOUT' })
  await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
  await checked
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('also bounds a stalled JSON body after headers have arrived', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: () => new Promise(() => {}) })))
  const checked = expect(fetchJson('/local-test')).rejects.toMatchObject({ code: 'API_TIMEOUT' })
  await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
  await checked
  expect(vi.getTimerCount()).toBe(0)
})

it('reports an invalid upstream body and clears its timeout', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>proxy failure</html>', { status: 502 })))
  await expect(fetchJson('/local-test')).rejects.toMatchObject({ code: 'API_RESPONSE_INVALID' })
  expect(vi.getTimerCount()).toBe(0)
})
