import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/botond-sleep-tracker/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sleep-icon.svg'],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      },
      manifest: {
        name: 'Botond alváskövető',
        short_name: 'Alvás',
        description: 'Egyszerű, helyi alváskövető',
        theme_color: '#07111f',
        background_color: '#07111f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/botond-sleep-tracker/',
        icons: [
          {
            src: '/botond-sleep-tracker/sleep-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
