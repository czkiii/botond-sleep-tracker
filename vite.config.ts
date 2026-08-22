import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Botond alváskövető',
        short_name: 'Alvás',
        description: 'Egyszerű, helyi alváskövető',
        theme_color: '#07111f',
        background_color: '#07111f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/'
      }
    })
  ]
})
