/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_INTERNAL_PREVIEW?: string
  readonly VITE_BUILD_SHA?: string
  readonly VITE_BASE_PATH?: string
  readonly VITE_SYNC_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
