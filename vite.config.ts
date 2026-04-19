import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Walthamstow Trains',
        short_name: 'Trains',
        description: 'Live Weaver-line arrivals over the East Avenue bridge',
        theme_color: '#f6efdf',
        background_color: '#f6efdf',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Dedicated maskable variant (generated with ~10% safe-zone padding)
          // so Android adaptive icons don't clip the Weaver roundel.
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://api.tfl.gov.uk',
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
});
