export const API_TIMEOUT_MS = 15_000

export class ApiTransportError extends Error {
  constructor(readonly code: 'API_TIMEOUT' | 'API_RESPONSE_INVALID') { super(code) }
}

// Include reading the response body in the deadline: receiving headers alone
// does not mean a mutation has been acknowledged. Retrying keeps its operation ID.
export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<{ response: Response; body: T }> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) onAbort()
  else options.signal?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiTransportError('API_TIMEOUT'))
      controller.abort()
    }, API_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal })
        let body: unknown
        try { body = await response.json() }
        catch (error) {
          if (controller.signal.aborted) throw error
          throw new ApiTransportError('API_RESPONSE_INVALID')
        }
        return { response, body: body as T }
      })(),
      deadline
    ])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
