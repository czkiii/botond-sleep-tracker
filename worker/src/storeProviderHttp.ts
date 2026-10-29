// Deliberately never expose provider response bodies, request URLs or credentials.
export class StoreProviderError extends Error {
  constructor(readonly code: string, readonly status = 422) { super(code) }
}

export function requireStoreValue(condition: unknown, code = 'STORE_RESPONSE_INVALID'): asserts condition {
  if (!condition) throw new StoreProviderError(code)
}

export function record(value: unknown): Record<string, unknown> {
  requireStoreValue(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

export function storeString(value: unknown, max = 512): string {
  requireStoreValue(typeof value === 'string' && value.length > 0 && value.length <= max)
  return value
}

export function storeTime(value: unknown): number {
  const time = typeof value === 'string' ? Date.parse(value) : value
  requireStoreValue(typeof time === 'number' && Number.isSafeInteger(time) && time > 0)
  return time
}

// A verification's complete network budget fits inside the existing 12s proxy.
// No redirect can forward a bearer credential to another host.
export class StoreHttp {
  private readonly deadline = Date.now() + 9_000
  constructor(private readonly transport: typeof fetch = fetch) {}

  async json(url: string, init: RequestInit = {}, empty = false): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const remaining = this.deadline - Date.now()
    if (remaining <= 0) throw new StoreProviderError('STORE_UNAVAILABLE', 503)
    const timeout = setTimeout(() => controller.abort(), remaining)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await this.transport(url, { ...init, redirect: 'error', signal: controller.signal })
      if (!response.ok) throw new StoreProviderError('STORE_UNAVAILABLE', 503)
      reader = response.body?.getReader()
      let text = '', size = 0
      const decoder = new TextDecoder()
      while (reader) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 256 * 1024) throw new StoreProviderError('STORE_RESPONSE_TOO_LARGE', 503)
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
      if (empty && !text.trim()) return {}
      return record(JSON.parse(text))
    } catch (error) {
      if (error instanceof StoreProviderError) throw error
      throw new StoreProviderError('STORE_UNAVAILABLE', 503)
    } finally {
      clearTimeout(timeout)
      await reader?.cancel().catch(() => {})
    }
  }
}
