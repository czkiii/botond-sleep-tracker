// Let the browser activate updates only after all old clients have closed.
// In particular, never reload an open editor or send SKIP_WAITING from a tab.
export async function registerPwa(baseUrl: string, serviceWorker?: Pick<ServiceWorkerContainer, 'register'>) {
  if (!serviceWorker) return
  try {
    await serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl, updateViaCache: 'none' })
  } catch (error) {
    // Offline first visits/unsupported storage must not stop the diary starting.
    console.warn('PWA registration unavailable; the diary can still open.', error)
  }
}
