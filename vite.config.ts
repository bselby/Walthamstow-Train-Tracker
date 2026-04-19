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
        // standalone (not fullscreen) so Android keeps the status bar visible
        // — the parent still needs their clock, battery, and signal while walking.
        display: 'standalone',
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
          },
          {
            // Google Fonts CSS — occasionally re-fetched so updated font revisions flow through.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            // Actual font files — content-hashed by Google, safe to cache for a year.
            // Without this the app falls back to Impact/Arial offline, which breaks the look.
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
