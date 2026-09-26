import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { assertProductionReleaseConfiguration } from './src/releaseConfiguration'

export default defineConfig(({ mode }) => {
  const releaseEnv = loadEnv(mode, '.', 'VITE_')
  assertProductionReleaseConfiguration(releaseEnv)
  const base = releaseEnv.VITE_BASE_PATH || '/botond-sleep-tracker/'
  return {
    // Keep the current GitHub Pages path until the repository URL is intentionally migrated.
    base,
    plugins: [
      react(),
      VitePWA({
        // Native registration waits for all old windows to close. Never take
        // over/reload an open diary while it may contain an unsaved draft.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['app-icon.png'],
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          navigateFallbackDenylist: [/^\/api(?:\/|$)/]
        },
        manifest: {
          name: 'Solemi Sleep',
          short_name: 'Solemi Sleep',
          description: 'Simple baby sleep tracking for families.',
          theme_color: '#07111f',
          background_color: '#07111f',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          icons: [
            {
              src: `${base}app-icon.png`,
              sizes: '1024x1024',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ]
  }
})
