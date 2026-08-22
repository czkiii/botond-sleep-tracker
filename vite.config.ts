import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Keep the current GitHub Pages path until the repository URL is intentionally migrated.
  base: '/botond-sleep-tracker/',
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
        start_url: '/botond-sleep-tracker/',
        icons: [
          {
            src: '/botond-sleep-tracker/app-icon.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
