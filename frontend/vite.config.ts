import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      manifest: {
        name: 'FOF Ops',
        short_name: 'FOF Ops',
        description: 'TCN Ikorodu Foundation of Faith Support Schedule',
        theme_color: '#ffffff',
        background_color: '#f9fafb',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'business'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/screenshots/mobile-1.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Your week at a glance' },
          { src: '/screenshots/mobile-2.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Your group and prayers' },
          { src: '/screenshots/desktop-1.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Support home' },
        ],
      },
      injectManifest: {
        // Saved for offline on the very first visit: the app itself. The PDF/export tools,
        // the class manuals and the guide are big and rarely needed; sw.ts saves those the
        // first time they are opened, so the first visit isn't spent downloading them.
        globIgnores: [
          '**/assets/jspdf*', '**/assets/html2canvas*', '**/assets/pdf-*', '**/assets/index.es-*',
          '**/assets/class*.js', '**/assets/intro-*.js', '**/assets/faithGuide*.js', '**/guides/**',
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor libs into their own long-cached
        // chunks so app deploys don't bust the vendor cache.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
