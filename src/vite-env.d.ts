/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_INTERNAL_PREVIEW?: string
  readonly VITE_BUILD_SHA?: string
  readonly VITE_BASE_PATH?: string
  readonly VITE_SYNC_API_BASE?: string
  readonly VITE_ACCOUNT_AUTH?: string
}

interface Window {
  google?: {
    accounts: { id: {
      initialize(options: { client_id: string; nonce: string; callback(response: { credential: string }): void }): void
      renderButton(target: HTMLElement, options: { theme: string; size: string; shape: string; width: number }): void
      disableAutoSelect(): void
    } }
  }
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
