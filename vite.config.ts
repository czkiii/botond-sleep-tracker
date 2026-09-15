import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, '.', 'VITE_').VITE_BASE_PATH || '/botond-sleep-tracker/'
  return {
    // Keep the current GitHub Pages path until the repository URL is intentionally migrated.
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['app-icon.png'],
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true
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
